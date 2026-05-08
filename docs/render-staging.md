# Render Staging Setup

Use this to create or maintain a separate Render service backed by Neon PostgreSQL, without touching the working JSON demo service.

Current staging service:

- URL: `https://gt-auction-staging.onrender.com`
- Dashboard: `https://dashboard.render.com/web/srv-d7v4c6tb910c73alh2j0`
- Render service id: `srv-d7v4c6tb910c73alh2j0`

## Create service

1. Render dashboard → **New +** → **Web Service**.
2. Choose GitHub repo: `CurrencyCarnage/Auction`.
3. Name: `gt-auction-staging`.
4. Branch: `main`.
5. Runtime: Node.
6. Build command:

```bash
npm ci && npm run build && npm run staging:setup
```

7. Start command:

```bash
npm start
```

## Environment variables

Set these on the staging service:

```env
DEMO_MODE=true
STORAGE_DRIVER=postgres
DATABASE_URL=postgresql://...neon.../neondb?sslmode=verify-full
SESSION_SECRET=<long random string>
ADMIN_SESSION_TOKEN=<long random string>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<staging admin password>
```

Notes:

- Use the Neon URL but prefer `sslmode=verify-full` instead of `sslmode=require` to avoid the pg SSL warning.
- Generate secrets locally with `openssl rand -hex 32` or any password generator.
- Keep the existing Render demo service on `STORAGE_DRIVER=json` until staging is manually verified.

## After deploy

Open the staging URL and verify:

- Homepage loads.
- `user1 / pass1` can bid.
- Proxy bidding works.
- Buy Now request works.
- `admin / admin` can add/edit/remove lots.
- Refreshing the page preserves state because it is backed by Neon.

## If staging breaks

Set `STORAGE_DRIVER=json` and redeploy. The app will fall back to JSON demo mode.
