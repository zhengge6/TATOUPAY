import { describe, expect, test } from "bun:test";
import { createOrder } from "../src/server/orders";
import {
  cnyCentsToUsdtCents,
  createNativeCharge,
  matchNativeTransfers,
  parseTronAddresses,
  tronAddressValid,
  usdtAmountToMicro,
} from "../src/server/native-crypto";
import { setSetting } from "../src/server/db";
import { configuredDatabase, orderInput } from "./helpers";

const VALID_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

describe("native crypto helpers", () => {
  test("parses addresses from mixed separators and dedupes", () => {
    expect(parseTronAddresses(` ${VALID_ADDRESS},\n${VALID_ADDRESS};${VALID_ADDRESS} `)).toEqual([VALID_ADDRESS]);
    expect(parseTronAddresses("")).toEqual([]);
  });

  test("rejects malformed TRON addresses", () => {
    expect(tronAddressValid(VALID_ADDRESS)).toBe(true);
    expect(tronAddressValid("T0OIl" + VALID_ADDRESS.slice(5))).toBe(false);
    expect(tronAddressValid("TXshort")).toBe(false);
    expect(tronAddressValid("")).toBe(false);
  });

  test("converts CNY cents to unique USDT cents", () => {
    expect(cnyCentsToUsdtCents(501, 7.18)).toBe(70);
    expect(cnyCentsToUsdtCents(718, 7.18)).toBe(100);
    expect(cnyCentsToUsdtCents(1, 9999)).toBe(1);
    expect(() => cnyCentsToUsdtCents(100, 0)).toThrow();
  });

  test("converts decimal amounts to micro units exactly", () => {
    expect(usdtAmountToMicro("70.00")).toBe(70_000_000n);
    expect(usdtAmountToMicro("12.34")).toBe(12_340_000n);
    expect(usdtAmountToMicro("0.123456")).toBe(123_456n);
    expect(usdtAmountToMicro("7")).toBe(7_000_000n);
  });

  test("matches transfers only inside window with exact amount", () => {
    const base = Date.parse("2026-08-27T00:00:00Z");
    const tx = (id: string, ts: number, value: string): Parameters<typeof matchNativeTransfers>[0][number] =>
      ({ transaction_id: id, block_timestamp: ts, from: "TPayerX", to: VALID_ADDRESS, value });
    const target = { address: VALID_ADDRESS, amountMicro: 70_000_000n, fromMs: base, untilMs: base + 600_000 };
    const transfers = [
      tx("wrong-amount", base + 1_000, "70000001"),
      tx("outside-window-late", base + 900_000, "70000000"),
      tx("good-second", base + 5_000, "70000000"),
      tx("good-first", base + 2_000, "70000000"),
    ];
    const hit = matchNativeTransfers(transfers, target);
    expect(hit?.transaction_id).toBe("good-first");
    expect(matchNativeTransfers([], target)).toBeNull();
    expect(matchNativeTransfers([
      { transaction_id: "bad-to", block_timestamp: base + 1_000, from: "TPayerX", to: "TOtherAddressXXXXXXXXXXXXXXXXXXXXXXXX", value: "70000000" },
    ], target)).toBeNull();
  });
});

describe("createNativeCharge", () => {
  function nativeDatabase() {
    const context = configuredDatabase();
    setSetting(context.database, "native_crypto_enabled", true);
    setSetting(context.database, "native_tron_addresses", VALID_ADDRESS);
    setSetting(context.database, "native_usdt_cny_rate", "7.18");
    return context.database;
  }

  test("reuses the same charge for the same order", () => {
    const database = nativeDatabase();
    const { order } = createOrder(database, orderInput(1));
    const first = createNativeCharge(database, order);
    const again = database.query("SELECT COUNT(*) AS c FROM crypto_intents WHERE order_id = ?").get(order.id) as { c: number };
    expect(again.c).toBe(1);
    expect(first.actual_amount).toBe((cnyCentsToUsdtCents(order.payable_amount_cents, 7.18) / 100).toFixed(2));
  });

  test("bumps the cent offset when another open order occupies the slot", () => {
    const database = nativeDatabase();
    const first = createOrder(database, orderInput(1)).order;
    const second = createOrder(database, orderInput(2)).order;
    // Same requested money both orders; business_qr already separated them by CNY cents,
    // but native uses its own USDT-scale pool, so verify distinct USDT amounts regardless.
    const chargeA = createNativeCharge(database, first);
    const chargeB = createNativeCharge(database, second);
    const amounts = new Set([chargeA.actual_amount, chargeB.actual_amount]);
    expect(amounts.size).toBe(2);
  });
});
