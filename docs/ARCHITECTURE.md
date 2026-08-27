# Architecture

Two-step checkout. Step one is a Stripe method list. Step two is channel-native.

```
EasyPay V1/V2
    -> TATOUPAY (Bun + Hono + React + SQLite)
         Alipay OpenAPI bills: business QR cent match / transfer memo match
         Crypto: vendored BEpusdt Go gateway (./bepusdt), runs beside Bun,
                 epusdt-compatible API, its own native checkout pages
         Vmq monitor heart/push stubs, not on checkout yet
```
