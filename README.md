<p align="center">
  <img src="public/logo.svg" width="88" height="88" alt="TATOUPAY" />
</p>

<h1 align="center">TATOUPAY</h1>

<p align="center">
  <strong>A single-instance payment gateway. Stripe-shaped checkout shell. Channel-native second screens.</strong>
</p>

<p align="center">
  One Bun process: merchant admin, hosted checkout, EasyPay-compatible APIs, Alipay bill matching, optional USDT via BEpusdt, and Vmq monitor endpoints.
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img alt="Bun" src="https://img.shields.io/badge/runtime-Bun%20%E2%89%A5%201.3-f9f1e1?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/language-TypeScript-3178C6?style=flat-square" />
  <img alt="Pages" src="https://img.shields.io/badge/site-GitHub%20Pages-111111?style=flat-square" />
</p>

Site: [lepao.me/Tatoupay](http://lepao.me/Tatoupay/)

## What it is

Tatoupay is **not** a multi-tenant acquirer. It is a **single merchant, single process** gateway:

- React admin and public checkout on one origin
- EasyPay V1 (MD5) and V2 (RSA) for existing merchant software
- Alipay OpenAPI V3 account-log matching
- Checkout **step one** is always Stripe-shaped (summary + method list)
- Checkout **step two** changes skin per rail

It does **not** implement refunds, payouts, close-order, settlement, or multi-merchant.

## Channels

| Rail | Backend | Matching | Second screen |
|------|---------|----------|----------------|
| Business QR | This process + Alipay OpenAPI | Unique payable amount (`+0.01` to `+0.99`) | Alipay official blue |
| Transfer | This process + `alipays://` | Amount + memo = merchant order id | Stripe panel |
| USDT | Keep BEpusdt (Go) as sidecar | On-chain confirm, notify back | BEpusdt visual language |
| Vmq | This process `/appHeart` `/appPush` | Amount lock + APK push | In progress |

BEpusdt is **not** rewritten in Bun. This repo calls `create-transaction` and accepts `notify`.

USDT on BNB Smart Chain is a **token**. Gas is **BNB**. Shared-address matching needs the **exact** USDT amount. Do not add gas into the USDT figure.

## Why this vs. three separate UIs

Typical stacks run three admins and three cashiers. Users learn three products.

Tatoupay splits work:

**Must not fail (this process)**  
Method list, order identity, EasyPay signatures, CSRF, SQLite constraints, notify body `success`.

**Channel-native UX**  
Alipay blue countdown, BEpusdt green amount + copy, Vmq amount codes.

## How to use

**Need:** [Bun](https://bun.sh) 1.3 or newer.

### Install

```bash
git clone https://github.com/zhengge6/Tatoupay.git
cd Tatoupay
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

First visit creates `admin` (password at least 12 characters). Put Alipay keys in Key Center and Collection settings. Optional: BEpusdt base URL and API token. Vmq APK against `/appHeart` and `/appPush`.

Production:

```bash
bun run build
bun run start
```

Set `PUBLIC_BASE_URL` to the HTTPS origin in front of the process. Leave `APP_MASTER_KEY` empty unless a secret manager injects it. Do not rotate `.master-key` after encrypted credentials exist.

## Protocol notes

**Alipay bills** — one merged scan for all pending orders. Checkout lives 5 minutes; matching continues until minute 10 (`late_paid` still reports `status=1`).

**EasyPay V1** — `submit.php`, `mapi.php`, `api.php`. Canonical query string plus merchant key, lowercase MD5. Official-bill rails accept `type=alipay` only.

**EasyPay V2** — SHA256WithRSA, 10-digit `timestamp`, plus or minus 300 seconds.

**Vmq monitor (partial)** — `sign(appHeart)=md5(t+key)`, `sign(appPush)=md5(type+price+t+key)`. Create-order admin UI is in progress.

**BEpusdt** — `POST /api/v1/order/create-transaction`; notify `status=2`, reply `success`.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Site](http://lepao.me/Tatoupay/)
- [Alipay V3 account log](https://opendocs.alipay.com/open-v3/26ed84be_alipay.data.bill.accountlog.query)
- [BEpusdt](https://github.com/v03413/BEpusdt)

## Security

- Admin sessions: HttpOnly, SameSite=Strict, Secure in production
- Writes: CSRF token and Origin
- Secrets: AES-256-GCM under `APP_MASTER_KEY`
- Amounts as integer cents
- Callbacks refuse private hosts unless `ALLOW_PRIVATE_CALLBACKS=true`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Do not commit `data/` or `.env`.

## License

Third-party runtimes such as BEpusdt keep their own licenses. This repo does not vendor their checkout HTML.
