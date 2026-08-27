<p align="center">
  <img src="public/logo.svg" width="88" height="88" alt="TATOUPAY" />
</p>

<h1 align="center">TATOUPAY</h1>

<p align="center">
  Self-hosted payment terminal for a single merchant.<br />
  One Bun process runs the admin console, the checkout, EasyPay-compatible APIs, and Alipay bill matching.
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> ·
  <a href="https://zhengge6.github.io/TATOUPAY/">Landing page</a>
</p>

<p align="center">
  <a href="https://github.com/zhengge6/TATOUPAY/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/zhengge6/TATOUPAY/actions/workflows/ci.yml/badge.svg?style=flat-square" /></a>
  <img alt="Bun" src="https://img.shields.io/badge/Bun-%E2%89%A51.3-000?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-private-lightgrey?style=flat-square" />
</p>

## Why TATOUPAY

- One process, one SQLite file: admin console, two-step checkout, payment APIs, and settlement matching ship together.
- Settlement truth comes from the Alipay bill ledger (`alipay.data.bill.accountlog.query`), not from trusting inbound webhooks.
- Crypto settles from the chain itself: a built-in TRC20 watcher watches your address pool inside the same process; no external gateway required.
- Checkout step one is a Stripe-style method list; step two wears the native skin of each rail instead of one shared template.

## Channels

| Rail | Status | How it settles |
|------|--------|----------------|
| Alipay business QR | Available | Official account log matches a unique cent: payable = order + `0.01`–`0.99` |
| Alipay transfer | Available | Amount + transfer memo carry the merchant order id |
| Crypto (native TRON) | Available | Built-in watcher polls TronGrid every 12 s; exact micro-amount match on confirmed TRC20 transfers |
| Crypto (BEpusdt) | Optional | Go sidecar fallback; network/asset follow its `trade_type`. Used only when the native pool is off |
| VMQ sign-free | Wiring up | Monitor `heart`/`push` endpoints exist. No create-order, no amount-code pool, not on checkout |

Explicitly out of scope: refunds, payouts, close-order, settlement sweeps, multi-merchant.

## How a payment settles

1. Order is created with a unique payable amount (the cent offset is the correlation key).
2. The second screen shows the exact amount. Checkout holds for 5 minutes; the matcher keeps watching until minute 10.
3. Pending orders are swept in one merged bill query per cycle. Cent found means paid: the order flips status and the upstream `notify_url` receives `success`.

## Quick start

Requires [Bun](https://bun.sh) >= 1.3.

```bash
git clone https://github.com/zhengge6/TATOUPAY.git
cd TATOUPAY
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

- Console and checkout: `http://localhost:5173`
- API: `http://127.0.0.1:3000`
- Health: `GET /healthz`, readiness: `GET /readyz`

First visit creates the `admin` account (password >= 12 chars). Configure Alipay keys in the admin UI; BEpusdt base URL, token and `trade_type` are optional settings on the same page.

For local development keep `NODE_ENV=development`, otherwise session cookies are marked `Secure` and HTTP logins fail.

## Configuration

| Variable | Default | Notes |
|----------|---------|-------|
| `NODE_ENV` | `production` | Use `development` locally for HTTP cookies |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | API bind address |
| `DATA_DIR` | `./data` | SQLite database, `.master-key`, uploads |
| `PUBLIC_BASE_URL` | - | Public HTTPS origin used in callbacks and links |
| `APP_MASTER_KEY` | empty | Empty generates `DATA_DIR/.master-key` on first start. Never rotate after secrets exist: encrypted columns become unreadable |
| `ALLOW_PRIVATE_CALLBACKS` | `false` | Set `true` only for local testing; blocks SSRF to private networks otherwise |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy |
| `BEPUSDT_BASE_URL` / `_API_TOKEN` / `_TRADE_TYPE` / `_ADDRESS` | empty | Optional USDT sidecar; empty hides the crypto method |

Backup strategy: stop the process, copy the whole `DATA_DIR` (SQLite files, `.master-key`, `uploads/`) together. Partial restores lose decryption.

## Deploy

```bash
bun run build
bun run start
```

Or with Docker Compose (requires `PUBLIC_BASE_URL` in the environment, data persisted to `./data`):

```bash
PUBLIC_BASE_URL=https://pay.example.com docker compose up -d --build
```

Compose publishes `127.0.0.1:3000` and sets `TRUST_PROXY=true`; put your TLS proxy in front.

## EasyPay-compatible API

Drop-in for existing EasyPay merchant plugins.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/submit.php` | GET / POST | Create order, redirect to checkout |
| `/mapi.php` | POST | Create order, JSON result |
| `/api.php?act=query` | GET / POST | Query by `out_trade_no` |
| `/api.php?act=order` | GET / POST | Single order detail (`trade_no` or `out_trade_no`) |
| `/api.php?act=orders` | GET / POST | Order list |

Signing: V1 sorts non-empty scalar params (excluding `sign`, `sign_type`), joins `k=v&k=v`, appends the merchant key, lowercased MD5. V2 uses SHA256WithRSA over the same canonical string plus a 10-digit unix-second `timestamp` with ±300 s tolerance; generate the merchant keypair from the admin console.

A modern JSON surface lives beside it: `POST /api/pay/create`, `POST /api/pay/query`, `POST /api/merchant/info`, `POST /api/merchant/orders`.

Crypto: enable **Native USDT (TRON)** in the admin console by setting an address pool and a CNY-per-USDT rate (snapshotted into each order at creation). The watcher polls TronGrid `transactions/trc20` every 12 s and marks an order paid when a confirmed transfer carries the exact expected micro-amount inside the order window. Keeping `bepusdt_base_url` + token also filled keeps the Go sidecar as fallback; it uses `POST /api/v1/order/create-transaction` and notify `status=2` → reply `success`.

VMQ monitor compatibility: `GET|POST /appHeart` and `/appPush` respond today; push-to-pay matching lands with the VMQ release.

## Project layout

```
src/server   Hono API: easypay, alipay bills, native tron-usdt watcher, bepusdt, orders, admin, vmq stubs
src/web      React console and checkout (shadcn/ui, Tailwind)
src/shared   Zod contracts shared by both sides
tests        Bun unit tests
e2e          Playwright end-to-end tests
docs         Landing page served by GitHub Pages (+ ARCHITECTURE.md)
```

## Development

```bash
bun run dev        # API (watch) + Vite dev server
bun run check      # typecheck + unit tests + build
bun run test:e2e   # Playwright suite
```

CI runs typecheck, tests, build, and e2e on every push and PR.

## Roadmap

- VMQ sign-free rail: amount-code pool with temp-price locks, `/createOrder` `/checkOrder` compatibility, checkout entry gated on monitor liveness.
- More second-screen skins per rail, consistent with the Stripe-shaped first step.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Alipay V3 account log](https://opendocs.alipay.com/open-v3/26ed84be_alipay.data.bill.accountlog.query)
- [BEpusdt](https://github.com/v03413/BEpusdt)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
