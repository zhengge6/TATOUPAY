import { audit, getSetting, type AppDatabase } from "./db";
import { AppError, assert } from "./errors";
import { expireOrders, markOrderPaidExternal } from "./orders";
import type { CryptoCharge } from "./bepusdt";

// Mainnet USDT (TRC20) contract on TRON.
export const TRC20_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const ADDRESS_PATTERN = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export interface NativeCryptoConfig {
  enabled: boolean;
  addresses: string[];
  rateCnyPerUsdt: number;
  apiUrl: string;
}

export function parseTronAddresses(raw: string): string[] {
  return Array.from(new Set(
    raw.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean),
  ));
}

export function tronAddressValid(address: string): boolean {
  return ADDRESS_PATTERN.test(address);
}

export function cnyCentsToUsdtCents(cents: number, rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) throw new AppError(503, "INVALID_USDT_RATE", "USDT 汇率无效");
  return Math.max(1, Math.round(cents / rate));
}

export function usdtAmountToMicro(amountText: string): bigint {
  const [whole, fraction = ""] = String(amountText).split(".");
  const padded = `${fraction}${"0".repeat(6)}`.slice(0, 6);
  return BigInt(`${whole || "0"}${padded}`);
}

export function getNativeCryptoConfig(database: AppDatabase): NativeCryptoConfig {
  const addresses = parseTronAddresses(getSetting(database, "native_tron_addresses", ""));
  const rate = Number.parseFloat(String(getSetting(database, "native_usdt_cny_rate", "")));
  const apiRaw = String(getSetting(database, "native_tron_api_url", "")).replace(/\/$/, "");
  return {
    enabled: Boolean(getSetting(database, "native_crypto_enabled", false)),
    addresses,
    rateCnyPerUsdt: Number.isFinite(rate) && rate > 0 ? rate : 0,
    apiUrl: apiRaw || "https://api.trongrid.io",
  };
}

export function nativeCryptoReady(database: AppDatabase): boolean {
  const config = getNativeCryptoConfig(database);
  return config.enabled && config.addresses.length > 0 && config.rateCnyPerUsdt > 0;
}

function openConflictsWith(database: AppDatabase, address: string, actualAmount: string, nowIso: string) {
  return database.query(`
    SELECT 1 FROM crypto_intents ci
    JOIN orders o ON o.id = ci.order_id
    WHERE ci.provider = 'native' AND ci.address = ? AND ci.actual_amount = ?
      AND o.status IN ('pending', 'expired') AND o.monitor_until > ?
    LIMIT 1
  `).get(address, actualAmount, nowIso);
}

export function createNativeCharge(database: AppDatabase, order: {
  id: string;
  trade_no: string;
  payable_amount_cents: number;
}): CryptoCharge {
  const config = getNativeCryptoConfig(database);
  assert(config.enabled && config.addresses.length > 0, 503, "CRYPTO_NOT_CONFIGURED", "原生 USDT 尚未配置收款地址");
  assert(config.rateCnyPerUsdt > 0, 503, "CRYPTO_NOT_CONFIGURED", "原生 USDT 尚未设置汇率");

  const poolCount = (database.query("SELECT COUNT(*) AS c FROM crypto_intents WHERE provider = 'native'").get() as { c: number }).c;
  const pickedAddress = config.addresses[poolCount % config.addresses.length];
  assert(pickedAddress, 503, "CRYPTO_NOT_CONFIGURED", "原生 USDT 收款地址池为空");
  const address = pickedAddress;
  const baseUsdtCents = cnyCentsToUsdtCents(order.payable_amount_cents, config.rateCnyPerUsdt);

  const nowIso = new Date().toISOString();
  const expiry = database.query("SELECT expires_at FROM orders WHERE id = ?").get(order.id) as { expires_at: string } | null;
  assert(expiry, 404, "ORDER_NOT_FOUND", "订单不存在");

  database.exec("BEGIN IMMEDIATE");
  try {
    let chosen = -1;
    let actualAmount = "";
    for (let offset = 0; offset < 100; offset += 1) {
      const candidate = baseUsdtCents + offset;
      const amountText = (candidate / 100).toFixed(2);
      if (!openConflictsWith(database, address, amountText, nowIso)) {
        chosen = candidate;
        actualAmount = amountText;
        break;
      }
    }
    assert(chosen >= 0, 429, "AMOUNT_POOL_EXHAUSTED", "该地址当前待支付订单过多，请稍后重试");

    const fiatAmount = (order.payable_amount_cents / 100).toFixed(2);
    const tradeId = `NT${order.trade_no}`;
    database.query(`
      INSERT INTO crypto_intents(id, order_id, provider, trade_id, address, actual_amount, fiat_amount, trade_type, payment_url, expiration_time, raw_json, created_at)
      VALUES (?, ?, 'native', ?, ?, ?, ?, 'usdt.trc20', '', ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      order.id,
      tradeId,
      address,
      actualAmount,
      fiatAmount,
      Math.floor(Date.parse(expiry.expires_at) / 1_000),
      JSON.stringify({ network: "tron", token: "USDT", rate_cny_per_usdt: config.rateCnyPerUsdt, base_usdt_cents: baseUsdtCents }),
      nowIso,
    );
    database.exec("COMMIT");
    return {
      trade_id: tradeId,
      order_id: order.id,
      address,
      actual_amount: actualAmount,
      amount: fiatAmount,
      trade_type: "usdt.trc20",
      payment_url: "",
      expiration_time: Math.floor(Date.parse(expiry.expires_at) / 1_000),
    };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export interface TronTransferEvent {
  transaction_id: string;
  block_timestamp: number;
  from: string;
  to: string;
  value: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function matchNativeTransfers(transfers: TronTransferEvent[], target: {
  address: string;
  amountMicro: bigint;
  fromMs: number;
  untilMs: number;
}): TronTransferEvent | null {
  const hits = transfers
    .filter((tx) => tx.to === target.address &&
      tx.block_timestamp >= target.fromMs - 60_000 &&
      tx.block_timestamp <= target.untilMs &&
      (() => { try { return BigInt(tx.value) === target.amountMicro; } catch { return false; } })())
    .sort((a, b) => a.block_timestamp - b.block_timestamp);
  return hits[0] ?? null;
}

async function fetchTrc20Transfers(config: NativeCryptoConfig, address: string, sinceMs: number): Promise<TronTransferEvent[]> {
  const url = `${config.apiUrl}/v1/accounts/${encodeURIComponent(address)}/transactions/trc20` +
    `?only_confirmed=true&limit=200&contract_address=${TRC20_USDT_CONTRACT}&min_timestamp=${Math.max(0, sinceMs - 60_000)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`tron api ${response.status}`);
  const body = asRecord(await response.json().catch(() => ({})));
  const items = Array.isArray(body.data) ? body.data.map(asRecord) : [];
  return items.flatMap((item) => {
    const tokenInfo = asRecord(item.token_info);
    if (item.type !== "Transfer" || String(tokenInfo.address ?? "") !== TRC20_USDT_CONTRACT) return [];
    return [{
      transaction_id: String(item.transaction_id ?? ""),
      block_timestamp: Number(item.block_timestamp ?? 0),
      from: String(item.from ?? ""),
      to: String(item.to ?? ""),
      value: String(item.value ?? "0"),
    }];
  });
}

export class UsdtWatcher {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly database: AppDatabase, private readonly intervalMs = 12_000) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const database = this.database;
      expireOrders(database);
      if (!nativeCryptoReady(database)) return;
      const config = getNativeCryptoConfig(database);
      const nowIso = new Date().toISOString();

      const targets = database.query(`
        SELECT ci.order_id, ci.address, ci.actual_amount, o.created_at, o.monitor_until
        FROM crypto_intents ci
        JOIN orders o ON o.id = ci.order_id
        WHERE ci.provider = 'native' AND o.status IN ('pending', 'expired') AND o.monitor_until > ?
        ORDER BY o.created_at ASC
      `).all(nowIso) as Array<{ order_id: string; address: string; actual_amount: string; created_at: string; monitor_until: string }>;
      if (!targets.length) return;

      const windows = new Map<string, number>();
      for (const target of targets) {
        const since = Date.parse(target.created_at);
        windows.set(target.address, Math.min(windows.get(target.address) ?? Number.MAX_SAFE_INTEGER, since));
      }

      for (const [address, sinceMs] of windows) {
        let transfers: TronTransferEvent[];
        try {
          transfers = await fetchTrc20Transfers(config, address, sinceMs);
        } catch (error) {
          console.log(JSON.stringify({ level: "warn", event: "usdt_watch_fetch_failed", address, message: String(error) }));
          continue;
        }
        for (const target of targets.filter((row) => row.address === address)) {
          const hit = matchNativeTransfers(transfers, {
            address,
            amountMicro: usdtAmountToMicro(target.actual_amount),
            fromMs: Date.parse(target.created_at),
            untilMs: Date.parse(target.monitor_until),
          });
          if (!hit) continue;
          markOrderPaidExternal(database, target.order_id, {
            paidAt: new Date(hit.block_timestamp).toISOString(),
            reference: hit.transaction_id,
            buyer: hit.from,
          });
          audit(database, "crypto.native_matched", {
            targetType: "order",
            targetId: target.order_id,
            details: { tx: hit.transaction_id, amount: target.actual_amount },
          });
        }
      }
    } finally {
      this.running = false;
    }
  }
}
