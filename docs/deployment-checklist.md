# Deployment Checklist

## Current safe public deployment

Use this for the Render demo until staging Postgres has been tested:

- `DEMO_MODE=true`
- `STORAGE_DRIVER=json`
- Set stable `SESSION_SECRET`
- Set stable `ADMIN_SESSION_TOKEN`
- Keep Render auto-deploy on only after CI is passing

## Staging PostgreSQL deployment

Use this before any production attempt:

1. Create a staging PostgreSQL database.
2. Set env vars:
   - `DEMO_MODE=true`
   - `STORAGE_DRIVER=postgres`
   - `DATABASE_URL=...`
   - `SESSION_SECRET=...`
   - `ADMIN_SESSION_TOKEN=...`
3. Run:

```bash
npm run db:migrate
npm run db:seed-demo
npm run test:postgres
```

4. Manually verify:
   - homepage loads
   - bidder login returns token
   - bid modal places bids
   - proxy bids work
   - Buy Now requests appear
   - admin login works
   - admin add/edit/remove works
   - audit endpoint contains bid/admin actions

## Before real production

Do **not** run real auctions until these are done:

- Replace demo users with real registration/login.
- Replace plaintext demo password assumptions with hashed passwords.
- Add phone/email verification.
- Add bidder approval/blocking workflow.
- Add legal terms/privacy pages.
- Add object storage for real photos/documents.
- Add database backups.
- Add monitoring/alerts.
- Run load/race tests for simultaneous bidding.
- Confirm auction rules with GT management/legal.

## Emergency rollback

If staging Postgres has issues, set:

```bash
STORAGE_DRIVER=json
```

The JSON demo path remains the default and is covered by build/smoke/behavior tests.
