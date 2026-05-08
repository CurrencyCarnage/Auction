# Migration Plan: Demo JSON → Production PostgreSQL

## Phase 0 — Current state

The app still runs on JSON-file storage. This is intentional for demo speed, but production work should now target the schema in `migrations/001_initial_schema.sql`.

## Phase 1 — Introduce storage boundary

Create a storage/service layer so routes stop mutating JSON directly:

- `listLots()`
- `getPublicState()`
- `placeBid()`
- `saveProxyBid()`
- `requestBuyNow()`
- `adminSaveLot()`
- `adminRemoveLot()`
- `adminOpenLots()`
- `listAuditEvents()`

Keep JSON implementation first. Add Postgres implementation behind the same interface.

## Phase 2 — Add Postgres in staging

- Provision Render PostgreSQL or external managed Postgres.
- Run `migrations/001_initial_schema.sql`.
- Add env vars:
  - `DATABASE_URL`
  - `SESSION_SECRET`
  - `ADMIN_USERNAME`
  - `ADMIN_PASSWORD`
  - `DEMO_MODE=false`
- Seed one manager/admin account.

## Phase 3 — Transactional bidding

Move `placeBid()` into a DB transaction:

1. Lock lot row.
2. Validate status/window/increment.
3. Validate bidder status/limit.
4. Insert immutable bid.
5. Update lot current amount.
6. Apply anti-snipe extension.
7. Insert audit event.
8. Commit.

## Phase 4 — Replace demo auth

Replace header-based auth with signed sessions/JWT and hashed passwords.

## Phase 5 — Cutover

- Keep demo deployment separate from production deployment.
- Production should never expose `admin/admin` or demo bidder accounts.
- Validate backup/export before first real auction.
