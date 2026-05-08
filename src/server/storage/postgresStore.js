import { createPool } from '../db/pool.js';

function num(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  return Number(value);
}
function time(value) {
  if (!value) return Date.now();
  return new Date(value).getTime();
}
function publicBid(row) {
  return {
    user: row.bid_user || 'opening',
    name: row.bidder_name || (row.bid_user ? 'Bidder' : 'Opening bid'),
    amount: num(row.amount),
    at: time(row.bid_created_at),
    type: row.kind,
  };
}

export class PostgresAuctionStore {
  constructor(config) {
    this.config = config;
    this.pool = createPool(config);
  }

  async readStateAsync() {
    const client = await this.pool.connect();
    try {
      const [lotsResult, bidsResult, proxyResult, buyNowResult, auditResult] = await Promise.all([
        client.query(`
          SELECT slug, brand, model, equipment_type, manufacture_year, usage_label, location,
                 current_bid_amount, bid_increment_amount, buy_now_amount, ends_at,
                 image_key, ui_accent, ui_shape, suspicious, created_at, updated_at
          FROM lots
          WHERE status IN ('scheduled', 'live', 'ended', 'pending_approval', 'approved')
          ORDER BY COALESCE(ends_at, created_at), created_at
        `),
        client.query(`
          SELECT lots.slug AS lot_slug, bids.amount, bids.kind, bids.created_at AS bid_created_at,
                 users.email AS bid_user, users.display_name AS bidder_name
          FROM bids
          JOIN lots ON lots.id = bids.lot_id
          LEFT JOIN users ON users.id = bids.user_id
          WHERE bids.status = 'valid'
          ORDER BY bids.created_at DESC
        `),
        client.query(`
          SELECT lots.slug AS lot_slug, users.email AS bid_user, proxy_bids.max_amount
          FROM proxy_bids
          JOIN lots ON lots.id = proxy_bids.lot_id
          JOIN users ON users.id = proxy_bids.user_id
          WHERE proxy_bids.status = 'active'
        `),
        client.query(`
          SELECT lots.slug AS lot_slug, users.email AS bid_user, buy_now_requests.price_amount, buy_now_requests.created_at
          FROM buy_now_requests
          JOIN lots ON lots.id = buy_now_requests.lot_id
          JOIN users ON users.id = buy_now_requests.user_id
          WHERE buy_now_requests.status = 'pending'
          ORDER BY buy_now_requests.created_at DESC
        `),
        client.query(`
          SELECT actor_type, action, detail, created_at
          FROM audit_events
          ORDER BY created_at DESC
          LIMIT 500
        `),
      ]);

      const bidsByLot = new Map();
      for (const row of bidsResult.rows) {
        if (!bidsByLot.has(row.lot_slug)) bidsByLot.set(row.lot_slug, []);
        bidsByLot.get(row.lot_slug).push(publicBid(row));
      }
      const proxyByLot = new Map();
      for (const row of proxyResult.rows) {
        if (!proxyByLot.has(row.lot_slug)) proxyByLot.set(row.lot_slug, {});
        proxyByLot.get(row.lot_slug)[row.bid_user] = num(row.max_amount);
      }
      const buyRequestsByLot = new Map();
      for (const row of buyNowResult.rows) {
        if (!buyRequestsByLot.has(row.lot_slug)) buyRequestsByLot.set(row.lot_slug, []);
        buyRequestsByLot.get(row.lot_slug).push({ user: row.bid_user, at: time(row.created_at), price: num(row.price_amount) });
      }

      const lots = lotsResult.rows.map(row => {
        const buyRequests = buyRequestsByLot.get(row.slug) || [];
        return {
          id: row.slug,
          brand: row.brand,
          model: row.model,
          type: row.equipment_type,
          location: row.location,
          year: row.manufacture_year,
          hours: row.usage_label || '—',
          current: num(row.current_bid_amount),
          increment: num(row.bid_increment_amount, 100),
          buyNow: num(row.buy_now_amount),
          endAt: time(row.ends_at),
          imageKey: row.image_key || row.slug,
          accent: row.ui_accent || '#56B461',
          shape: row.ui_shape || 'truck',
          suspicious: Boolean(row.suspicious),
          buyRequested: buyRequests.length > 0,
          buyRequests,
          bids: bidsByLot.get(row.slug) || [{ user: 'opening', name: 'Opening bid', amount: num(row.current_bid_amount), at: time(row.created_at), type: 'opening' }],
          proxy: proxyByLot.get(row.slug) || {},
        };
      });

      const createdAt = lots.length ? Math.min(...lots.map(l => l.bids.at(-1)?.at || Date.now())) : Date.now();
      return {
        createdAt,
        updatedAt: Date.now(),
        lots,
        audit: auditResult.rows.map(row => ({
          at: time(row.created_at),
          actor: row.actor_type,
          action: row.action,
          detail: row.detail || {},
        })),
      };
    } finally {
      client.release();
    }
  }

  writeState() {
    throw new Error('PostgreSQL mutations are not implemented yet. Keep STORAGE_DRIVER=json until adapter parity is complete.');
  }
  async writeStateAsync() { return this.writeState(); }
  resetState() {
    throw new Error('PostgreSQL reset is not implemented yet. Use db:seed-demo for seeded databases.');
  }
  async resetStateAsync() { return this.resetState(); }
}
