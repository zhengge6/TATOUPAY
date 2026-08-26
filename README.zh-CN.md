<p align="center">
  <img src="public/logo.svg" width="88" height="88" alt="TATOUPAY" />
</p>

<h1 align="center">TATOUPAY</h1>

<p align="center">
  <strong>单实例收款网关。第一层是 Stripe 式收银台，第二层按通道换皮。</strong>
</p>

<p align="center">
  一个 Bun 进程同时提供商户后台、公开收银台、易支付兼容接口、支付宝账务匹配，以及可选的 USDT（BEpusdt）和 V免签监控端点。
</p>

<p align="center">
  <a href="README.md">English</a> | 简体中文
</p>

<p align="center">
  <img alt="Bun" src="https://img.shields.io/badge/runtime-Bun%20%E2%89%A5%201.3-f9f1e1?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/language-TypeScript-3178C6?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-see%20upstream-111111?style=flat-square" />
</p>

基于 [MiaM1ku/AliMPay](https://github.com/MiaM1ku/AliMPay) 扩展：支付宝经营码、转账码、USDT（BEpusdt 旁路）、V免签监控协议。

## 它是什么

TATOUPAY **不是**多商户收单系统。它是 **单商户、单进程** 网关：

- 同一域名下的 React 后台与公开收银台
- 易支付 V1（MD5）与 V2（RSA），给已有商户程序接入
- 支付宝开放平台 V3 `alipay.data.bill.accountlog.query` 官方账单匹配
- 收银台 **第一步** 永远是 Stripe：左订单摘要、右支付方式
- **第二步** 按通道换皮：支付宝蓝倒计时、BEpusdt 绿金额卡、后续 V免签

不实现退款、代付、关单、结算、多商户。

## 通道

| 通道 | 后端 | 对账 | 二级页 |
|------|------|------|--------|
| 商家码 | 本进程 + 支付宝开放平台 | 唯一实付金额（`+0.01`–`+0.99`） | 支付宝官方蓝 |
| 转账码 | 本进程 + `alipays://` | 金额 + `memo` = 商户订单号 | Stripe 面板 |
| USDT | **保留 BEpusdt（Go）** | 链上确认后回调 | BEpusdt 官方视觉 |
| V免签 | 本进程 `/appHeart` `/appPush` | 金额锁 + APK 推送 | 支付页待补 |

BEpusdt **不**改写成 Bun。扫块、汇率、地址锁、确认数仍在 Go。本仓库只调 `create-transaction` 并接收 `notify`。

BNB Smart Chain 上的 USDT 是 **代币**。矿工费是 **BNB**。共享地址必须付 **精确** USDT 数量，不要把 gas 加进 USDT。

## 为什么不把三套后台拼在一起

常见做法是 TATOUPAY、BEpusdt、V免签各跑一套后台、三套收银台，用户要学三次。

这里把工作拆开：

**不允许失败（本进程）**  
支付方式列表、订单身份、易支付签名、CSRF、SQLite 约束、回调必须回 `success`。

**通道自己的产品语言**  
支付宝蓝倒计时、BEpusdt 绿金额与复制、V免签金额码。

## 使用

**需要：** [Bun](https://bun.sh) ≥ 1.3。

### 安装

```bash
git clone https://github.com/zhengge6/Tatoupay.git
cd Tatoupay
bun install --frozen-lockfile
cp .env.example .env
```

### 快速开始

```bash
bun run dev
```

- 后台 / 收银台：`http://localhost:5173`
- API：`http://127.0.0.1:3000`
- 健康检查：`GET /healthz`  `GET /readyz`

首次访问创建 `admin`（密码至少 12 位）。支付宝密钥在 **密钥中心** 和 **收款配置**。可选：BEpusdt 根地址与 API Token；V免签 APK 指向 `/appHeart`、`/appPush`。

生产：

```bash
bun run build
bun run start
```

把 `PUBLIC_BASE_URL` 设成反代后的 HTTPS 根地址。`APP_MASTER_KEY` 一般留空。加密凭据写入后不要更换 `.master-key`。

## 协议要点

**支付宝账单** — 所有待确认订单合并扫一次，不是每单一次 HTTP。收银台 5 分钟有效，匹配持续到第 10 分钟（`late_paid` 对外仍是 `status=1`）。

**易支付 V1** — `submit.php`、`mapi.php`、`api.php`。规范串后直接追加商户 key，小写 MD5。官方账单通道只接受 `type=alipay`。

**易支付 V2** — SHA256WithRSA，10 位秒级 `timestamp`，允许相差 300 秒。

**V免签监控（部分）** — `sign(appHeart)=md5(t+key)`，`sign(appPush)=md5(type+price+t+key)`。创单与金额码后台仍在做。

**BEpusdt** — `POST /api/v1/order/create-transaction`；回调 `status=2` 用同一套 MD5 token，响应正文 `success`。

## 文档

- [架构](docs/ARCHITECTURE.md)
- 上游：[MiaM1ku/AliMPay](https://github.com/MiaM1ku/AliMPay)
- 支付宝 V3 账务明细：[开放平台](https://opendocs.alipay.com/open-v3/26ed84be_alipay.data.bill.accountlog.query)
- BEpusdt：[v03413/BEpusdt](https://github.com/v03413/BEpusdt)

## 安全

- 管理会话：HttpOnly、SameSite=Strict，生产环境 Secure
- 写接口：CSRF + Origin
- 应用私钥、V1 key、V2 平台私钥、BEpusdt token、V免签 key：`APP_MASTER_KEY` 下 AES-256-GCM
- 金额以整数分存储
- 回调默认拒绝私网，除非 `ALLOW_PRIVATE_CALLBACKS=true`

## 参与

这是一份在用的 fork。请对 Stripe 外壳和通道模块（`src/server/bepusdt.ts`、`src/server/vmq.ts`）做小改动。不要提交 `data/` 或 `.env`。

## 许可

以 [上游仓库](https://github.com/MiaM1ku/AliMPay) 为准，除非本仓库另加 `LICENSE`。BEpusdt 等第三方保持其原许可；本仓库不内嵌其收银台 HTML。
