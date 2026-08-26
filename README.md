<p align="center">
  <img src="public/logo.svg" width="88" height="88" alt="AliMPay" />
</p>

<h1 align="center">AliMPay</h1>

<p align="center">
  <strong>A single-instance payment gateway with a Stripe-class checkout shell and channel-native second screens.</strong>
</p>

<p align="center">
  One Bun process. Merchant admin, hosted checkout, EasyPay-compatible APIs, Alipay bill matching, optional USDT via BEpusdt, and V免签 monitor hooks.
</p>

<p align="center">
  <img alt="Bun" src="https://img.shields.io/badge/runtime-Bun%20%E2%89%A5%201.3-f9f1e1?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/language-TypeScript-3178C6?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-see%20upstream-111111?style=flat-square" />
</p>

Forked from [MiaM1ku/AliMPay](https://github.com/MiaM1ku/AliMPay) and extended into a multi-rail cashier: Alipay business QR, Alipay transfer, USDT (BEpusdt sidecar), and V免签-compatible monitor endpoints.

## What it is

AliMPay is **not** a multi-tenant acquirer. It is a **single merchant, single process** gateway:

- React admin and public checkout from one origin
- EasyPay V1 (MD5) and V2 (RSA) for existing merchant software
- Alipay OpenAPI V3 `alipay.data.bill.accountlog.query` for official bill matching
- Checkout **step one** always looks like Stripe (order summary + payment method list)
- Checkout **step two** changes skin per rail (Alipay blue cashier, BEpusdt card, later V免签)

It does **not** implement refunds, payouts, close-order, settlement, or multi-merchant.

## Channels

| Rail | Backend | Matching | Second screen |
|------|---------|----------|----------------|
| Business QR | This process + Alipay OpenAPI | Unique payable amount (`+0.01`–`+0.99`) | Official Alipay blue |
| Transfer | This process + `alipays://` | Amount + `memo` = `out_trade_no` | Stripe panel |
| USDT | **Keep BEpusdt (Go)** as sidecar | On-chain confirm in BEpusdt, notify back | BEpusdt official visual language |
| V免签 | This process `/appHeart` `/appPush` | Amount lock + APK push | Planned V免签 pay page |

BEpusdt is **not** rewritten in Bun. Chain scan, FX, address lock, and confirmations stay in Go. This repo only calls `create-transaction` and accepts `notify`.

USDT on BNB Smart Chain is a **token**. Gas is **BNB**. Shared-address matching requires the **exact** USDT amount; do not add gas into the USDT figure.

## Why this vs. gluing three UIs

Typical stacks run AliMPay, BEpusdt, and V免签 as three admin sites and three cashier skins. Merchants then teach users three different checkouts.

AliMPay splits work the same way OpenCodeReview splits engineering vs. agent:

**Must not fail (this process)**  
Method list, order identity, EasyPay signatures, CSRF, SQLite constraints, notify `success` semantics.

**Channel-native (judgment + UX)**  
Each rail keeps the product language users already trust: Alipay blue countdown, BEpusdt green amount + copy, V免签 amount codes.

## How to use

**Need:** [Bun](https://bun.sh) ≥ 1.3.

### Install

```bash
git clone https://github.com/zhengge6/AliMPay.git
cd AliMPay
bun install --frozen-lockfile
cp .env.example .env
```

### Quick start

```bash
bun run dev
```

- Admin / checkout: `http://localhost:5173`
- API: `http://127.0.0.1:3000`
- Health: `GET /healthz`  `GET /readyz`

First visit creates `admin` (password ≥ 12 chars). Put Alipay app keys in **密钥中心** and **收款配置**. Optional: BEpusdt base URL + API token for USDT; V免签 APK against `/appHeart` and `/appPush`.

Production:

```bash
bun run build
bun run start
```

Set `PUBLIC_BASE_URL` to the HTTPS origin in front of the process. Leave `APP_MASTER_KEY` empty unless you inject it from a secret manager. Never rotate `.master-key` after encrypted credentials exist.

## Protocol notes

**Alipay bills** — one merged scan for all pending orders, not one HTTP call per order. Checkout is live for 5 minutes; matching continues until minute 10 (`late_paid` still reports `status=1`).

**EasyPay V1** — `submit.php`, `mapi.php`, `api.php`. Canonical query string + merchant key, lowercase MD5. `type=alipay` only on the official-bill rails.

**EasyPay V2** — SHA256WithRSA, 10-digit `timestamp`, ±300s.

**V免签 monitor (partial)** — `sign(appHeart)=md5(t+key)`, `sign(appPush)=md5(type+price+t+key)`. Create-order / amount-code admin UI is in progress.

**BEpusdt** — `POST /api/v1/order/create-transaction`; notify `status=2` with the same MD5 token scheme, reply body `success`.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- Upstream: [MiaM1ku/AliMPay](https://github.com/MiaM1ku/AliMPay)
- Alipay V3 account log: [opendocs](https://opendocs.alipay.com/open-v3/26ed84be_alipay.data.bill.accountlog.query)
- BEpusdt: [v03413/BEpusdt](https://github.com/v03413/BEpusdt)

## Security

- Admin sessions: HttpOnly, SameSite=Strict, Secure in production
- Write APIs: CSRF token + Origin
- App private key, V1 key, V2 platform key, BEpusdt token, V免签 key: AES-256-GCM under `APP_MASTER_KEY`
- Amounts stored as integer cents
- Callbacks reject private hosts unless `ALLOW_PRIVATE_CALLBACKS=true`

## Contributing

This tree is a working fork. Prefer small diffs against the Stripe checkout shell and isolated channel modules (`src/server/bepusdt.ts`, `src/server/vmq.ts`). Do not commit `data/` or `.env`.

## License

Follow the [upstream project](https://github.com/MiaM1ku/AliMPay) unless a `LICENSE` file is added here. Third-party runtimes (BEpusdt) keep their own licenses; this repo does not vendor their checkout HTML.
