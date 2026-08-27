<p align="center">
  <img src="public/logo.svg" width="88" height="88" alt="TATOUPAY" />
</p>

<h1 align="center">TATOUPAY</h1>

<p align="center">
  单商户自托管收款终端。<br />
  一个 Bun 进程同时跑管理后台、收银台、易支付兼容接口和支付宝账务对账。
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> ·
  <a href="https://zhengge6.github.io/TATOUPAY/">产品主页</a>
</p>

<p align="center">
  <a href="https://github.com/zhengge6/TATOUPAY/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/zhengge6/TATOUPAY/actions/workflows/ci.yml/badge.svg?style=flat-square" /></a>
  <img alt="Bun" src="https://img.shields.io/badge/Bun-%E2%89%A51.3-000?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square" />
  <img alt="License" src="https://img.shields.io/badge/license-private-lightgrey?style=flat-square" />
</p>

## 为什么是 TATOUPAY

- 一个进程、一个 SQLite 文件：后台、收银台、支付接口、账务匹配一起交付。
- 到账判定来自支付宝账单流水（`alipay.data.bill.accountlog.query`），不信任入站 Webhook。
- 加密货币直接以链上为真：同一进程内置 TRC20 监控看守你的地址池，无需外部网关。
- 收银台第一步是 Stripe 式支付方式列表；第二步按通道换原生皮肤，不做同一套模板。

## 通道

| 通道 | 状态 | 到账方式 |
|------|------|----------|
| 支付宝经营码 | 可用 | 开放平台账务明细匹配唯一分：应付 = 订单 + `0.01`–`0.99` |
| 支付宝转账 | 可用 | 金额 + 转账备注携带商户订单号 |
| 加密货币（原生 TRON） | 可用 | 内置监控每 12 秒轮询 TronGrid，已确认 TRC20 转账按精确微元匹配 |
| 加密货币（BEpusdt） | 可选 | Go 旁路兜底；网络与资产由其 `trade_type` 决定。仅在关闭原生池时启用 |
| V免签 | 接入中 | 监控 `heart`/`push` 端点已就绪。创单、金额码池、收银台入口未接 |

明确不做：退款、代付、关单、结算、多商户。

## 一笔订单如何对账

1. 创单时生成唯一应付金额（分位偏移就是关联键）。
2. 二级屏展示精确金额。收银台保留 5 分钟，对账观察到第 10 分钟。
3. 每轮把所有待确认订单合并成一次账单查询。查到该分即视为已付：订单翻状态，上游 `notify_url` 收到 `success`。

## 快速开始

需要 [Bun](https://bun.sh) >= 1.3。

```bash
git clone https://github.com/zhengge6/TATOUPAY.git
cd TATOUPAY
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

- 后台与收银台：`http://localhost:5173`
- API：`http://127.0.0.1:3000`
- 健康检查：`GET /healthz`，就绪检查：`GET /readyz`

首次访问创建 `admin` 账号（密码至少 12 位）。在后台配置支付宝密钥；BEpusdt 根地址、Token、`trade_type` 是同页可选配置。

本地开发保持 `NODE_ENV=development`，否则 Cookie 带 `Secure`，HTTP 下登不进后台。

## 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | `production` | 本地开发用 `development`，保证 HTTP Cookie 可用 |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | API 监听地址 |
| `DATA_DIR` | `./data` | SQLite 数据库、`.master-key`、上传文件 |
| `PUBLIC_BASE_URL` | - | 对外 HTTPS 域名，用于回调和链接 |
| `APP_MASTER_KEY` | 空 | 留空则首次启动生成 `DATA_DIR/.master-key`。写入密文后禁止更换：已加密字段将无法解密 |
| `ALLOW_PRIVATE_CALLBACKS` | `false` | 仅本地调试设 `true`；默认拦截指向内网的回调（防 SSRF） |
| `TRUST_PROXY` | `false` | 反向代理后置 `true` |
| `BEPUSDT_BASE_URL` / `_API_TOKEN` / `_TRADE_TYPE` / `_ADDRESS` | 空 | 可选 USDT 旁路；留空隐藏加密货币方式 |

备份策略：先停进程，整体拷贝 `DATA_DIR`（SQLite 文件、`.master-key`、`uploads/`）。缺一份就无法解密。

## 部署

```bash
bun run build
bun run start
```

或使用 Docker Compose（需在环境里提供 `PUBLIC_BASE_URL`，数据持久化在 `./data`）：

```bash
PUBLIC_BASE_URL=https://pay.example.com docker compose up -d --build
```

Compose 只发布 `127.0.0.1:3000` 并设置 `TRUST_PROXY=true`，TLS 终结交给前置代理。

## 易支付兼容接口

现有易支付商户插件可平移接入。

| 端点 | 方法 | 用途 |
|------|------|------|
| `/submit.php` | GET / POST | 创建订单并跳转收银台 |
| `/mapi.php` | POST | 创建订单，返回 JSON |
| `/api.php?act=query` | GET / POST | 按 `out_trade_no` 查询 |
| `/api.php?act=order` | GET / POST | 单笔详情（`trade_no` 或 `out_trade_no`） |
| `/api.php?act=orders` | GET / POST | 订单列表 |

签名规则：V1 将非空标量参数（排除 `sign`、`sign_type`）ASCII 排序拼成 `k=v&k=v`，末尾拼接商户 KEY，取小写 MD5。V2 在同一规范串上做 SHA256WithRSA，附加 10 位秒级 `timestamp`，允许 ±300 秒偏差；商户密钥对可在后台生成。

旁边还有一套现代 JSON 接口：`POST /api/pay/create`、`POST /api/pay/query`、`POST /api/merchant/info`、`POST /api/merchant/orders`。

加密货币：在后台「收款配置」开启**原生 USDT（TRON）**，填地址池与 CNY/USDT 汇率（汇率在创单时快照写入订单）。监控每 12 秒拉取 TronGrid `transactions/trc20`，窗口内出现携带精确微元数额的已确认转账即判定到账并回调上游。同时保留 `bepusdt_base_url` + Token 则维持 Go 旁路兜底：`POST /api/v1/order/create-transaction` 创建，回调 `status=2` 后响应 `success`。

V免签监控兼容：`GET|POST /appHeart` 与 `/appPush` 已可响应；推送 matched 打单随 VMQ 版本落地。

## 项目结构

```
src/server   Hono API：easypay、支付宝账单、原生 TRON-USDT 监控、bepusdt、订单、后台、vmq 桩
src/web      React 后台与收银台（shadcn/ui、Tailwind）
src/shared   两端共享的 Zod 契约
tests        Bun 单元测试
e2e          Playwright 端到端测试
docs         GitHub Pages 产品主页（含 ARCHITECTURE.md）
```

## 开发

```bash
bun run dev        # API（watch）+ Vite 开发服务器
bun run check      # 类型检查 + 单元测试 + 构建
bun run test:e2e   # Playwright 用例
```

每次 push 和 PR 都会跑 CI：类型检查、测试、构建、e2e。

## 路线图

- V免签通道：金额码池与临时价格锁、`/createOrder` `/checkOrder` 兼容层、按监控在线状态开放的收银台入口。
- 更多二级屏皮肤，延续 Stripe 式第一步。

## 文档

- [架构](docs/ARCHITECTURE.md)
- [支付宝 V3 账务明细](https://opendocs.alipay.com/open-v3/26ed84be_alipay.data.bill.accountlog.query)
- [BEpusdt](https://github.com/v03413/BEpusdt)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
