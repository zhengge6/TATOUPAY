import { createHash } from "node:crypto";
import { getSecret } from "./config";
import { getSetting, type AppDatabase } from "./db";
import { AppError, assert } from "./errors";
import { markOrderPaidExternal } from "./orders";

export interface CryptoCharge {
  trade_id: string;
  order_id: string;
  address: string;
  actual_amount: string;
  amount: string;
  trade_type: string;
  payment_url: string;
  expiration_time: number;
}

export function getBepusdtConfig(database: AppDatabase) {
  const baseUrl = (getSetting(database, "bepusdt_base_url", "") || process.env.BEPUSDT_BASE_URL || "").replace(/\/$/, "");
  const token = getSecret(database, "bepusdt_api_token") || process.env.BEPUSDT_API_TOKEN || "";
  const tradeType = getSetting(database, "bepusdt_trade_type", "") || process.env.BEPUSDT_TRADE_TYPE || "usdt.trc20";
  return { baseUrl, token, tradeType, enabled: Boolean(baseUrl && token) };
}

function md5(value: string) {
  return createHash("md5").update(value, "utf8").digest("hex");
}

export function bepusdtSign(parameters: Record<string, string | number>, token: string) {
  const canonical = Object.entries(parameters)
    .filter(([key, value]) => key !== "signature" && value !== "" && value !== undefined && value !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
  return md5(`${canonical}${token}`);
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function getCryptoCharge(database: AppDatabase, orderId: string): CryptoCharge | null {
  const row = database.query("SELECT * FROM crypto_intents WHERE order_id = ? ORDER BY created_at DESC LIMIT 1").get(orderId) as {
    trade_id: string;
    address: string;
    actual_amount: string;
    fiat_amount: string;
    trade_type: string;
    payment_url: string;
    expiration_time: number | null;
  } | null;
  if (!row) return null;
  return {
    trade_id: row.trade_id,
    order_id: orderId,
    address: row.address,
    actual_amount: row.actual_amount,
    amount: row.fiat_amount,
    trade_type: row.trade_type,
    payment_url: row.payment_url,
    expiration_time: row.expiration_time ?? 0,
  };
}

export async function createCryptoCharge(database: AppDatabase, order: {
  id: string;
  trade_no: string;
  name: string;
  payable_amount_cents: number;
  checkout_token: string;
}): Promise<CryptoCharge> {
  const config = getBepusdtConfig(database);
  assert(config.enabled, 503, "CRYPTO_NOT_CONFIGURED", "未配置 BEpusdt 地址或 API Token");
  const existing = getCryptoCharge(database, order.id);
  if (existing) return existing;

  const publicBase = getSetting(database, "public_base_url", "").replace(/\/$/, "");
  const amount = (order.payable_amount_cents / 100).toFixed(2);
  const payload: Record<string, string | number> = {
    order_id: order.trade_no,
    amount,
    fiat: "CNY",
    trade_type: config.tradeType,
    name: order.name.slice(0, 127),
    notify_url: `${publicBase}/public-api/bepusdt/notify`,
    redirect_url: `${publicBase}/checkout/${encodeURIComponent(order.checkout_token)}`,
    timeout: 600,
  };
  payload.signature = bepusdtSign(payload, config.token);

  const response = await fetch(`${config.baseUrl}/api/v1/order/create-transaction`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const body = asRecord(await response.json().catch(() => ({})));
  const data = asRecord(body.data);
  assert(response.ok && Number(body.status_code ?? response.status) === 200 && data.token && data.trade_id, 502, "CRYPTO_CREATE_FAILED", String(body.message ?? body.msg ?? "BEpusdt 下单失败"));

  const charge: CryptoCharge = {
    trade_id: String(data.trade_id),
    order_id: order.id,
    address: String(data.token),
    actual_amount: String(data.actual_amount ?? ""),
    amount: String(data.amount ?? amount),
    trade_type: config.tradeType,
    payment_url: String(data.payment_url ?? ""),
    expiration_time: Number(data.expiration_time ?? 600),
  };
  database.query(`
    INSERT INTO crypto_intents(id, order_id, provider, trade_id, address, actual_amount, fiat_amount, trade_type, payment_url, expiration_time, raw_json, created_at)
    VALUES (?, ?, 'bepusdt', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    order.id,
    charge.trade_id,
    charge.address,
    charge.actual_amount,
    charge.amount,
    charge.trade_type,
    charge.payment_url,
    charge.expiration_time,
    JSON.stringify(data),
    new Date().toISOString(),
  );
  return charge;
}

export function handleBepusdtNotify(database: AppDatabase, body: Record<string, unknown>) {
  const config = getBepusdtConfig(database);
  assert(config.enabled, 503, "CRYPTO_NOT_CONFIGURED", "未配置 BEpusdt");
  const parameters: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null || value === "") continue;
    parameters[key] = String(value);
  }
  const sign = parameters.signature ?? "";
  assert(sign && sign === bepusdtSign(parameters, config.token), 401, "INVALID_SIGNATURE", "BEpusdt 回调签名错误");
  if (parameters.status !== "2") return { ok: true, ignored: true };

  const intent = database.query("SELECT order_id FROM crypto_intents WHERE trade_id = ?").get(parameters.trade_id ?? "") as { order_id: string } | null;
  assert(intent, 404, "CRYPTO_INTENT_NOT_FOUND", "找不到对应加密货币订单");
  markOrderPaidExternal(database, intent.order_id, {
    paidAt: new Date().toISOString(),
    reference: parameters.block_transaction_id || parameters.trade_id,
    buyer: parameters.token ?? "",
  });
  return { ok: true };
}
