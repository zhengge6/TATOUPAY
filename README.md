<p align="center">
  <img src="public/logo.svg" width="88" height="88" alt="TATOUPAY" />
</p>

<h1 align="center">TATOUPAY</h1>

<p align="center">
  Single-merchant payment gateway. One Bun process: admin, checkout, EasyPay APIs, Alipay bill matching.
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a>
  ·
  <a href="https://zhengge6.github.io/TATOUPAY/">Site</a>
</p>

<p align="center">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-%E2%89%A51.3-000?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square" />
</p>

Checkout step one is a Stripe-style method list. Step two uses the native UI of each rail.

## Channels

| Rail | How it settles |
|------|----------------|
| Alipay business QR | OpenAPI account log, unique amount `+0.01`–`+0.99` |
| Alipay transfer | Amount + memo = merchant order id |
| USDT | BEpusdt (Go) sidecar, on-chain confirm |
| Vmq | `/appHeart` `/appPush`, amount lock |

No refunds, payouts, close-order, settlement, or multi-merchant.

USDT on BNB Smart Chain is a token. Gas is BNB. Shared-address match is exact USDT amount.

## How to use

Requires [Bun](https://bun.sh) >= 1.3.

```bash
git clone https://github.com/zhengge6/TATOUPAY.git
cd TATOUPAY
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

- UI: `http://localhost:5173`
- API: `http://127.0.0.1:3000`
- Health: `GET /healthz`

First visit creates `admin` (password length >= 12). Configure Alipay keys in the admin UI. Optional: BEpusdt base URL and token.

```bash
bun run build
bun run start
```

Set `PUBLIC_BASE_URL` to the public HTTPS origin. Leave `APP_MASTER_KEY` empty unless injected. Do not rotate `data/.master-key` after secrets are stored.

## Protocol

- EasyPay V1: `submit.php`, `mapi.php`, `api.php`. MD5 of canonical query + key.
- EasyPay V2: SHA256WithRSA, 10-digit `timestamp`, ±300s.
- Alipay bills: one merged scan while pending orders exist. Checkout 5 min; match until minute 10.
- BEpusdt: `POST /api/v1/order/create-transaction`; notify `status=2`, reply `success`.
- Vmq: `md5(t+key)`, `md5(type+price+t+key)`. Create-order UI not finished.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Alipay V3 account log](https://opendocs.alipay.com/open-v3/26ed84be_alipay.data.bill.accountlog.query)
- [BEpusdt](https://github.com/v03413/BEpusdt)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## Tests

```bash
bun run typecheck
bun run test
bun run build
```
