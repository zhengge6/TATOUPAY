# Architecture

Two-step checkout. Step one is a Stripe method list. Step two is channel-native.

```
EasyPay V1/V2
    -> TATOUPAY (Bun + Hono + React + SQLite)
         Alipay OpenAPI bills
         BEpusdt Go sidecar (trade_type from that service)
         Vmq not on checkout yet
```
