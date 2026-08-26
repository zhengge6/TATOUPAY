<p align="center">
  <img src="public/logo.svg" width="88" height="88" alt="TATOUPAY" />
</p>

<h1 align="center">TATOUPAY</h1>

<p align="center">
  单商户收款网关。一个 Bun 进程：后台、收银台、易支付接口、支付宝账务匹配。
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a>
  ·
  <a href="https://zhengge6.github.io/Tatoupay/">Site</a>
</p>

<p align="center">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-%E2%89%A51.3-000?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square" />
</p>

收银台第一步是 Stripe 式支付方式列表。第二步按通道换皮。

## 通道

| 通道 | 到账方式 |
|------|----------|
| 支付宝经营码 | 开放平台账务明细，唯一实付 `+0.01`–`+0.99` |
| 支付宝转账 | 金额 + 备注 = 商户订单号 |
| USDT | BEpusdt（Go）旁路，链上确认 |
| V免签 | `/appHeart` `/appPush`，金额锁 |

不实现退款、代付、关单、结算、多商户。

BSC 上 USDT 是代币，矿工费是 BNB。共享地址必须付精确 USDT 数量。

## 使用

需要 [Bun](https://bun.sh) >= 1.3。

```bash
git clone https://github.com/zhengge6/Tatoupay.git
cd Tatoupay
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

- 界面：`http://localhost:5173`
- API：`http://127.0.0.1:3000`
- 健康检查：`GET /healthz`

首次访问创建 `admin`（密码至少 12 位）。在后台配置支付宝密钥。BEpusdt 根地址和 Token 可选。

```bash
bun run build
bun run start
```

`PUBLIC_BASE_URL` 设为对外 HTTPS 根地址。`APP_MASTER_KEY` 一般留空。加密凭据写入后不要更换 `data/.master-key`。

## 协议

- 易支付 V1：`submit.php`、`mapi.php`、`api.php`。规范串 + key，小写 MD5。
- 易支付 V2：SHA256WithRSA，10 位秒级时间戳，允许相差 300 秒。
- 支付宝账单：有待确认订单时合并扫一次。收银台 5 分钟，匹配到第 10 分钟。
- BEpusdt：`POST /api/v1/order/create-transaction`；回调 `status=2`，响应 `success`。
- V免签：`md5(t+key)`、`md5(type+price+t+key)`。创单后台未完成。

## 文档

- [架构](docs/ARCHITECTURE.md)
- [支付宝 V3 账务明细](https://opendocs.alipay.com/open-v3/26ed84be_alipay.data.bill.accountlog.query)
- [BEpusdt](https://github.com/v03413/BEpusdt)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## 测试

```bash
bun run typecheck
bun run test
bun run build
```
