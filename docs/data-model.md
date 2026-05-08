# Production Data Model

This is the target PostgreSQL model for moving beyond demo JSON state.

## Design goals

- Bids are immutable append-only records.
- Lot `current_bid_amount` is derived/updated transactionally from valid bids.
- Admin actions are audit logged.
- Winner approval and offline handoff are explicit states, not hidden notes.
- Soft status changes beat destructive deletion for real auction records.

## Core tables

### users

Bidders/customers.

Important fields:

- `id`
- `email`, `phone`, `password_hash`
- `display_name`
- `status`: `pending`, `approved`, `blocked`
- `bid_limit_amount`
- verification timestamps

### admin_users

GT staff / representatives / managers.

Important fields:

- `id`
- `email`
- `password_hash`
- `role`: `representative`, `manager`, `super_admin`
- `status`

### lots

Auctionable equipment.

Important fields:

- `id`, `slug`
- brand/model/type/year/location/usage
- description/condition
- `status`: `draft`, `scheduled`, `live`, `ended`, `pending_approval`, `approved`, `cancelled`
- `starting_price_amount`, `current_bid_amount`, `reserve_price_amount`, `buy_now_amount`, `bid_increment_amount`
- `starts_at`, `ends_at`
- anti-snipe config
- created/updated/published metadata

### lot_assets

Photos, inspection reports, documents.

- `kind`: `photo`, `inspection_report`, `document`
- `url`, `sort_order`, `caption`

### bids

Immutable bid events.

Important fields:

- `id`, `lot_id`, `user_id`
- `amount`
- `kind`: `manual`, `proxy_auto`, `opening`, `admin_adjustment`
- `status`: `valid`, `retracted`, `cancelled`, `rejected`
- timestamp, IP/user-agent hashes where appropriate

### proxy_bids

Maximum bid instructions.

- `lot_id`, `user_id`, `max_amount`
- status active/cancelled/exhausted

### buy_now_requests

Offline Buy Now interest/requests.

- `lot_id`, `user_id`, `price_amount`
- status pending/accepted/rejected/cancelled

### auction_results

Winner review state.

- `lot_id`
- winner/fallback winner
- final amount
- approval status
- approved/cancelled by manager

### handoff_tasks

Offline payment and pickup/delivery workflow.

- responsible admin
- payment status
- delivery/pickup status
- notes/deadline

### audit_events

Append-only event log for sensitive operations.

- actor type/id
- action
- entity type/id
- JSON detail
- timestamp

## Transaction requirement for bidding

Bid placement must be a single DB transaction:

1. Lock lot row (`SELECT ... FOR UPDATE`).
2. Verify lot status/time window.
3. Verify bidder status and limit.
4. Verify amount >= current + increment.
5. Insert bid row.
6. Update lot current bid.
7. Apply anti-snipe extension if needed.
8. Insert audit event.
9. Commit.

If any step fails, no partial bid should be saved.
