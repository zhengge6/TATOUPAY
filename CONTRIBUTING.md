# Contributing

Work against the Stripe checkout shell and isolated channel files.

## Layout

```
src/server/     HTTP, SQLite, Alipay, BEpusdt, V免签
src/web/        React admin + checkout
src/shared/     contracts
tests/          bun test
e2e/            Playwright
docs/           architecture notes
public/         logo and static assets
```

## Rules

- Do not commit `data/` or `.env`
- Keep checkout **step one** Stripe-shaped
- Keep **step two** channel-native (Alipay blue, BEpusdt card, V免签)
- Do not vendor BEpusdt HTML (GPL). Call its API.
- Prefer small diffs

```bash
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
```
