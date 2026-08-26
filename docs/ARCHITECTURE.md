# Architecture

Two-step checkout. Step one is a Stripe method list. Step two is channel-native.

```
EasyPay V1/V2
    -> Tatoupay (Bun + Hono + React + SQLite)
         Alipay OpenAPI bills
         BEpusdt Go sidecar (USDT)
         Vmq /appHeart /appPush
```

USDT on BSC: match token amount. Gas is BNB.
