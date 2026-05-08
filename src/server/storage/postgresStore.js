import { createPool } from '../db/pool.js';
import { freshState } from './seedData.js';

function num(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  return Number(value);
}
function time(value) {
  if (!value) return Date.now();
  return new Date(value).getTime();
}
function date(value) {
  return new Date(Number(value || Date.now()));
}
function usernameFromEmail(email) {
  if (!email) return null;
  return String(email).split('@')[0];
}
function emailForUser(username) {
  if (!username || username === 'opening') return null;
  return String(username).includes('@') ? String(username) : `${username}@example.local`;
}
function publicBid(row) {
  const username = usernameFromEmail(row.bid_user);
  return {
    user: username || 'opening',
    name: row.bidder_name || (username ? 'Bidder' : 'Opening bid'),
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
        proxyByLot.get(row.lot_slug)[usernameFromEmail(row.bid_user)] = num(row.max_amount);
      }
      const buyRequestsByLot = new Map();
      for (const row of buyNowResult.rows) {
        if (!buyRequestsByLot.has(row.lot_slug)) buyRequestsByLot.set(row.lot_slug, []);
        buyRequestsByLot.get(row.lot_slug).push({ user: usernameFromEmail(row.bid_user), at: time(row.created_at), price: num(row.price_amount) });
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

  async writeStateAsync(state) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const lot of state.lots || []) {
        const status = Date.now() > Number(lot.endAt) ? 'ended' : 'live';
        const lotResult = await client.query(`
          INSERT INTO lots (
            slug, brand, model, equipment_type, manufacture_year, usage_label, location, status,
            starting_price_amount, current_bid_amount, buy_now_amount, bid_increment_amount,
            starts_at, ends_at, published_at, image_key, ui_accent, ui_shape, suspicious
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE((SELECT starts_at FROM lots WHERE slug=$1), now()),$13,COALESCE((SELECT published_at FROM lots WHERE slug=$1), now()),$14,$15,$16,$17)
          ON CONFLICT (slug) DO UPDATE SET
            brand = EXCLUDED.brand,
            model = EXCLUDED.model,
            equipment_type = EXCLUDED.equipment_type,
            manufacture_year = EXCLUDED.manufacture_year,
            usage_label = EXCLUDED.usage_label,
            location = EXCLUDED.location,
            status = EXCLUDED.status,
            current_bid_amount = EXCLUDED.current_bid_amount,
            buy_now_amount = EXCLUDED.buy_now_amount,
            bid_increment_amount = EXCLUDED.bid_increment_amount,
            ends_at = EXCLUDED.ends_at,
            image_key = EXCLUDED.image_key,
            ui_accent = EXCLUDED.ui_accent,
            ui_shape = EXCLUDED.ui_shape,
            suspicious = EXCLUDED.suspicious,
            updated_at = now()
          RETURNING id
        `, [
          lot.id,
          lot.brand,
          lot.model,
          lot.type,
          lot.year,
          lot.hours,
          lot.location,
          status,
          lot.bids?.at(-1)?.amount ?? lot.current ?? 0,
          lot.current ?? 0,
          lot.buyNow ?? 0,
          lot.increment ?? 100,
          date(lot.endAt),
          lot.imageKey || lot.id,
          lot.accent || '#56B461',
          lot.shape || 'truck',
          Boolean(lot.suspicious),
        ]);
        const lotId = lotResult.rows[0].id;

        await client.query('DELETE FROM bids WHERE lot_id = $1', [lotId]);
        for (const bid of [...(lot.bids || [])].reverse()) {
          const email = emailForUser(bid.user);
          const userId = email ? (await client.query('SELECT id FROM users WHERE email = $1', [email])).rows[0]?.id : null;
          await client.query(`
            INSERT INTO bids (lot_id, user_id, amount, kind, status, created_at)
            VALUES ($1,$2,$3,$4,'valid',$5)
          `, [lotId, userId, bid.amount || 0, bid.type || 'manual', date(bid.at)]);
        }

        await client.query('DELETE FROM proxy_bids WHERE lot_id = $1', [lotId]);
        for (const [username, max] of Object.entries(lot.proxy || {})) {
          const email = emailForUser(username);
          const userId = email ? (await client.query('SELECT id FROM users WHERE email = $1', [email])).rows[0]?.id : null;
          if (!userId) continue;
          await client.query(`
            INSERT INTO proxy_bids (lot_id, user_id, max_amount, status)
            VALUES ($1,$2,$3,'active')
            ON CONFLICT (lot_id, user_id) DO UPDATE SET max_amount = EXCLUDED.max_amount, status = 'active', updated_at = now()
          `, [lotId, userId, max]);
        }

        await client.query('DELETE FROM buy_now_requests WHERE lot_id = $1 AND status = $2', [lotId, 'pending']);
        for (const request of lot.buyRequests || []) {
          const email = emailForUser(request.user);
          const userId = email ? (await client.query('SELECT id FROM users WHERE email = $1', [email])).rows[0]?.id : null;
          if (!userId) continue;
          await client.query(`
            INSERT INTO buy_now_requests (lot_id, user_id, price_amount, status, created_at)
            VALUES ($1,$2,$3,'pending',$4)
          `, [lotId, userId, request.price || lot.buyNow || 0, date(request.at)]);
        }
      }

      await client.query('DELETE FROM audit_events');
      for (const event of [...(state.audit || [])].reverse()) {
        await client.query(`
          INSERT INTO audit_events (actor_type, action, detail, created_at)
          VALUES ($1,$2,$3,$4)
        `, [event.actor || 'system', event.action || 'unknown', event.detail || {}, date(event.at)]);
      }

      await client.query('COMMIT');
      return this.readStateAsync();
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  writeState() {
    throw new Error('PostgreSQL storage is async-only. Use writeStateAsync().');
  }
  async resetStateAsync() {
    return this.writeStateAsync(freshState());
  }
  resetState() {
    throw new Error('PostgreSQL storage is async-only. Use resetStateAsync().');
  }
}
