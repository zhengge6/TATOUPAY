import { createHash } from "node:crypto";
import { Hono, type Context } from "hono";
import { getSecret, setSecret } from "./config";
import { getSetting, setSetting, type AppDatabase } from "./db";
import { randomAlphaNumeric } from "./security";

function md5(value: string) {
  return createHash("md5").update(value, "utf8").digest("hex");
}

function requestParams(query: Record<string, string>, body: Record<string, unknown>) {
  const result: Record<string, string> = { ...query };
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string" || typeof value === "number") result[key] = String(value);
  }
  return result;
}

async function readParams(c: Context) {
  const query = c.req.query();
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return requestParams(query, await c.req.json().catch(() => ({})));
  }
  return requestParams(query, await c.req.parseBody().catch(() => ({})));
}

function vmqKey(database: AppDatabase) {
  const existing = getSecret(database, "vmq_key");
  if (existing) return existing;
  const generated = randomAlphaNumeric(32);
  setSecret(database, "vmq_key", generated);
  return generated;
}

function fail(message: string) {
  return { code: -1, msg: message };
}

function ok(message = "成功") {
  return { code: 1, msg: message };
}

export function createVmqRoutes(database: AppDatabase) {
  const app = new Hono();

  async function heart(c: Context) {
    const parameters = await readParams(c);
    const t = parameters.t ?? "";
    const sign = parameters.sign ?? "";
    if (!t || !sign) return c.json(fail("t/sign 不能为空"));
    if (sign !== md5(`${t}${vmqKey(database)}`)) return c.json(fail("密钥错误---请检查配置数据！"));
    const now = String(Math.floor(Date.now() / 1000));
    setSetting(database, "vmq_lastheart", now);
    setSetting(database, "vmq_jkstate", "1");
    return c.json(ok());
  }

  async function push(c: Context) {
    const parameters = await readParams(c);
    const t = parameters.t ?? "";
    const type = parameters.type ?? "";
    const price = Number.parseFloat(parameters.price ?? "").toFixed(2);
    const sign = parameters.sign ?? "";
    if (!t || !type || !parameters.price || !sign) return c.json(fail("参数不完整"));
    if (sign !== md5(`${type}${parameters.price}${t}${vmqKey(database)}`) && sign !== md5(`${type}${price}${t}${vmqKey(database)}`)) {
      return c.json(fail("密钥错误---请检查配置数据！"));
    }
    setSetting(database, "vmq_lastpay", String(Math.floor(Date.now() / 1000)));
    const order = database.query(`
      SELECT id, notify_url, pay_id, param, price, really_price, type FROM vmq_order
      WHERE state = 0 AND type = ? AND really_price = ? ORDER BY create_date ASC LIMIT 1
    `).get(Number(type), price) as {
      id: string;
      notify_url: string;
      pay_id: string;
      param: string;
      price: string;
      really_price: string;
      type: number;
    } | null;
    if (!order) return c.json(ok("无匹配订单"));
    const now = Math.floor(Date.now() / 1000);
    database.query("UPDATE vmq_order SET state = 1, pay_date = ?, close_date = ? WHERE id = ? AND state = 0").run(now, now, order.id);
    database.query("DELETE FROM vmq_tmp_price WHERE oid = ?").run(order.id);
    return c.json(ok());
  }

  app.on(["GET", "POST"], "/appHeart", (c) => heart(c));
  app.on(["GET", "POST"], "/appPush", (c) => push(c));
  app.on(["GET", "POST"], "/api/monitor/heart", (c) => heart(c));
  app.on(["GET", "POST"], "/api/monitor/push", (c) => push(c));

  return app;
}

export function vmqMonitorStatus(database: AppDatabase) {
  const lastHeart = Number(getSetting(database, "vmq_lastheart", "0")) || 0;
  const online = lastHeart > 0 && Math.floor(Date.now() / 1000) - lastHeart < 30;
  return {
    online,
    lastheart: lastHeart,
    jkstate: getSetting(database, "vmq_jkstate", "-1"),
    has_key: Boolean(getSecret(database, "vmq_key")),
  };
}
