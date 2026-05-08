# PostgreSQL Adapter Status

The app now has a PostgreSQL storage adapter behind `STORAGE_DRIVER=postgres`, but JSON remains the safe default.

## Implemented

- `readStateAsync()` maps PostgreSQL rows into the current frontend state shape.
- `writeStateAsync()` persists the current state shape into PostgreSQL in one transaction.
- `resetStateAsync()` reseeds using the existing demo seed state.
- Demo seed tooling exists: `npm run db:seed-demo`.
- Migrations exist under `migrations/`.
- Transaction-shaped bidder commands exist:
  - `placeBidTx(user, bid)` locks the lot row with `SELECT ... FOR UPDATE`, validates price/window/limit, inserts bid/audit rows, updates the lot, and applies proxy auto-bid logic.
  - `saveProxyTx(user, proxy)` locks the lot row, validates max bid, upserts proxy config, optionally places the leading proxy bid, and audits it.
  - `requestBuyNowTx(user, request)` locks the lot row, inserts a pending request, and audits it.

## Important caveat

`writeStateAsync()` is still a parity bridge for admin/demo snapshot persistence. Bidder-facing Postgres commands are now transaction-shaped, but they still need integration testing against a real Postgres database before enabling `STORAGE_DRIVER=postgres` anywhere public.

Next production step: implement dedicated admin transaction methods (`adminSaveLotTx`, `adminRemoveLotTx`, `adminOpenLotsTx`) and run the full test suite against a real staging database.
