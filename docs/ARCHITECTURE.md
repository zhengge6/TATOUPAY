# Architecture

Checkout is a two-step Stripe shell. Step two is channel-native.

```
Merchant (EasyPay V1/V2)
        │
        ▼
 AliMPay  (Bun + Hono + React + SQLite)
   step 1: payment method list
   step 2:
     business QR  → Alipay blue cashier
     transfer     → Stripe panel + alipays URI
     USDT         → BEpusdt visual language
     V免签        → amount QR (monitor APK)

 BEpusdt (Go) remains a sidecar:
   create-transaction → address + actual USDT amount
   notify status=2    → mark AliMPay order paid
```

USDT on BNB Smart Chain: match **USDT amount**, not BNB gas. Shared address = exact amount. Exclusive address = one order per address.
