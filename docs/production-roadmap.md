# GT Auction Production Roadmap

This repo is currently a strong presentation MVP. It is not production-ready yet. The goal is to evolve it safely without losing demo velocity.

## Current MVP state

- React/Vite frontend with polished heavy-equipment auction UI.
- Express backend with JSON-file state.
- Demo bidder accounts (`user1/pass1` etc.).
- Demo admin panel (`admin/admin`).
- Working bidding, proxy bidding, buy-now request, lot add/edit/remove, and open-all timing controls.
- Render-friendly Node deployment.

## Production readiness principles

1. **Bidding integrity first** — every bid must be atomic, validated server-side, and audit logged.
2. **Authentication cannot be fake** — no hardcoded admin/bidder accounts outside demo mode.
3. **Persistent data is mandatory** — JSON file is fine for demo, unacceptable for real auctions.
4. **Operations need visibility** — logs, audit trails, exports, backups, and admin action history.
5. **Legal/offline handoff matters** — GT approval, payment, delivery, cancellation, and dispute handling must be explicit.
6. **Keep demo mode alive** — useful for sales meetings, but clearly separated from production mode.

## Work chunks

### Chunk 1 — Foundation hardening

- Add environment-driven runtime config.
- Add demo/prod mode boundary.
- Add security headers, request limits, and basic health endpoint.
- Add audit/event structure for bids/admin actions.
- Add safer validation for lot/admin/bid inputs.
- Document deployment environment variables.

### Chunk 2 — Data layer

- Replace JSON file with PostgreSQL.
- Define schema/migrations for users, admins, lots, bids, proxy bids, buy-now requests, audit logs, and handoff tasks.
- Make bid placement transactional/atomic.
- Add backup/export workflow.

### Chunk 3 — Real authentication and roles

- Admin auth with hashed passwords or identity provider.
- Bidder registration/login with email/phone verification.
- Roles: bidder, representative, manager, super admin.
- Permissions: draft lots, publish lots, close/cancel, approve winner, manage users.

### Chunk 4 — Auction rules engine

- Configurable start/end time, increments, reserve, Buy Now, proxy bidding, anti-snipe extension.
- Winner review flow, fallback winner, cancellation/retraction policy.
- Immutable bid history.

### Chunk 5 — Admin operations

- Proper admin dashboard with lot status pipeline: draft → scheduled → live → ended → pending approval → approved/cancelled.
- Photo/document upload.
- Inspection reports.
- Export winners and bidding history.
- Offline payment/delivery task tracking.

### Chunk 6 — UX, localization, and content

- Georgian/English UI labels.
- Terms/privacy/auction rules pages.
- Mobile bidder flow polish.
- Empty states, errors, loading states.
- Accessibility pass.

### Chunk 7 — Notifications

- Outbid notifications.
- Winner notification.
- Admin alerts for suspicious bids / Buy Now requests.
- Email/SMS/WhatsApp/Telegram channel decision.

### Chunk 8 — Infrastructure

- Production hosting choice.
- PostgreSQL + object storage.
- CI checks: build, lint, tests.
- Monitoring and uptime alerts.
- Staging vs production separation.

## Immediate recommendation

Do not add more flashy UI first. The next useful work is Chunk 1, then Chunk 2. Without real data/auth/audit, the platform can demo beautifully but cannot safely run real auctions.
