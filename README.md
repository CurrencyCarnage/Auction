# GT Auction Demo

Presentation MVP for GT Group auction concept: heavy construction/commercial vehicle lots, demo users, bidding, proxy bidding, buy-now requests, admin lot management, and manager-review auction flow.

## Local run

```bash
npm install
npm run build
npm start
```

Then open `http://localhost:4173`.

## Demo credentials

Bidder users:

- `user1` / `pass1`
- `user2` / `pass2`
- `user3` / `pass3`
- `user4` / `pass4`
- `user5` / `pass5`

Demo admin:

- `admin` / `admin`

## Render deploy

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment: Node

## Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4173` | Render sets this automatically. |
| `DEMO_MODE` | `true` | Set to `false` for production hardening. |
| `ADMIN_USERNAME` | `admin` in demo mode | Required when `DEMO_MODE=false`. |
| `ADMIN_PASSWORD` | `admin` in demo mode | Required when `DEMO_MODE=false`. |
| `ADMIN_SESSION_TOKEN` | random per server start | Optional fixed admin API token for simple deployments; replace with real sessions before production. |
| `STORAGE_DRIVER` | `json` | Keep `json` for demo; `postgres` is scaffolded for the production adapter. |
| `DATABASE_URL` | empty | Required when `STORAGE_DRIVER=postgres`. |
| `DATA_DIR` | `./data` | JSON state directory for demo mode. Replace with DB in production. |

## Health check

`GET /healthz` returns runtime health and mode.

## Database migrations

```bash
DATABASE_URL=postgres://... npm run db:migrate
```

The PostgreSQL schema exists, but the live app still defaults to JSON storage until adapter parity is implemented and tested.

## Production plan

See [`docs/production-roadmap.md`](docs/production-roadmap.md).
