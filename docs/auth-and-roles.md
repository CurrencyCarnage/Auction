# Authentication and Roles

This is the current auth baseline for the GT Auction MVP.

## Bidder accounts

PostgreSQL-backed bidder accounts live in `users`.

Important fields:

- `email` / `phone`: login identifiers. Demo users use `user1@example.local`, etc.
- `password_hash`: scrypt password hash in `scrypt$<salt>$<hash>` format.
- `status`: `pending`, `approved`, or `blocked`.
- `bid_limit_amount`: per-bidder ceiling enforced when bidding or setting a proxy bid.

Only `approved` bidders can log in and bid.

## Admin accounts

Admin accounts live in `admin_users`.

Roles:

- `representative`: intended for lot drafting and basic operational work.
- `manager`: intended for publish/cancel/winner review decisions.
- `super_admin`: full administrative access.

The current UI still treats any active admin as fully privileged, but login tokens now carry `role` so route-level permissions can be tightened next.

## Sessions

Successful login returns a signed session token:

- bidder tokens include `type=bidder`, `username`, `name`, `limit`, and `status`.
- admin tokens include `type=admin`, `username`, and `role`.

Tokens are HMAC-signed with `SESSION_SECRET` and expire after 24 hours.

## Password hashing

`src/server/auth/password.js` uses Node's built-in `crypto.scryptSync` with a random salt.

Legacy early-demo hashes are still accepted temporarily:

- `demo-only-password-*`
- `demo-only-admin-password-admin`

They exist only so old staging rows do not break immediately. Running `npm run staging:setup` reseeds demo accounts with real scrypt hashes.

## Demo compatibility

When `DEMO_MODE=true`, the old `x-demo-user` header still works for local smoke/dev convenience. It is disabled when `DEMO_MODE=false`.

## Next hardening step

Add route-level admin permission checks:

- representatives can draft lots but not publish/cancel/approve winners.
- managers can publish/cancel/approve winners.
- super admins can manage admins and system settings.
