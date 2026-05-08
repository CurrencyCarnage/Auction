# PostgreSQL Adapter Status

The app now has a PostgreSQL storage adapter behind `STORAGE_DRIVER=postgres`, but JSON remains the safe default.

## Implemented

- `readStateAsync()` maps PostgreSQL rows into the current frontend state shape.
- `writeStateAsync()` persists the current state shape into PostgreSQL in one transaction.
- `resetStateAsync()` reseeds using the existing demo seed state.
- Demo seed tooling exists: `npm run db:seed-demo`.
- Migrations exist under `migrations/`.

## Important caveat

`writeStateAsync()` is a parity bridge, not the final production bidding engine. It persists the current state snapshot transactionally, but it still follows the demo service behavior where the service mutates an in-memory state object and then writes it.

For real auctions, the next step is dedicated transactional command methods such as:

- `placeBidTx(user, bid)`
- `saveProxyBidTx(user, proxy)`
- `requestBuyNowTx(user, request)`
- `adminSaveLotTx(admin, lot)`

`placeBidTx` must lock the lot row with `SELECT ... FOR UPDATE`, validate current price/time/window, insert immutable bid rows, update the lot, insert audit events, and commit atomically.

Until that is done, keep production deployment on JSON/demo mode or use Postgres only for staging tests.
