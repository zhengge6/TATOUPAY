# Architecture

Two-step checkout. Step one is a Stripe method list. Step two is channel-native.

```
EasyPay V1/V2
    -> TATOUPAY (Bun + Hono + React + SQLite)
         Alipay OpenAPI bills: business QR cent match / transfer memo match
         Crypto: built-in TRON USDT watcher (TronGrid TRC20 polling, unique micro-amount)
                 optional BEpusdt Go sidecar fallback when configured
         Vmq monitor heart/push stubs, not on checkout yet
```
