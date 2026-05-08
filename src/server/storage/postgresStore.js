import { createPool } from '../db/pool.js';
import { verifyPassword } from '../auth/password.js';
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
  return String(username).includes('@') ? String(username).toLowerCase() : `${String(username).toLowerCase()}@example.local`;
}
function normalizeLogin(login) {
  return String(login || '').trim().toLowerCase();
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
function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
function money(n) { return '₾' + Math.round(n).toLocaleString('en-US'); }

export class PostgresAuctionStore {
  constructor(config) {
    this.config = config;
    this.pool = createPool(config);
  }

  async findBidderByLogin(login, password) {
    const normalized = normalizeLogin(login);
    const email = normalized.includes('@') ? normalized : emailForUser(normalized);
    const row = (await this.pool.query(`
      SELECT email, password_hash, display_name, status, bid_limit_amount
      FROM users
      WHERE lower(email) = $1 OR phone = $2
      LIMIT 1
    `, [email, normalized])).rows[0];
    if (!row || !verifyPassword(password, row.password_hash)) return null;
    const username = usernameFromEmail(row.email) || normalized;
    return { username, name: row.display_name, limit: num(row.bid_limit_amount), status: row.status };
  }

  async findAdminByLogin(login, password) {
    const normalized = normalizeLogin(login);
    const email = normalized.includes('@') ? normalized : `${normalized}@example.local`;
    const row = (await this.pool.query(`
      SELECT email, password_hash, display_name, role, status
      FROM admin_users
      WHERE lower(email) = $1
      LIMIT 1
    `, [email])).rows[0];
    if (!row || !verifyPassword(password, row.password_hash)) return null;
    return { username: usernameFromEmail(row.email), name: row.display_name, role: row.role, status: row.status };
  }

  async readStateAsync() {
    const client = await this.pool.connect();
    try {
      const lotsResult = await client.query(`
        SELECT slug, brand, model, equipment_type, manufacture_year, usage_label, location,
               current_bid_amount, bid_increment_amount, buy_now_amount, ends_at,
               image_key, ui_accent, ui_shape, suspicious, created_at, updated_at
        FROM lots
        WHERE status IN ('scheduled', 'live', 'ended', 'pending_approval', 'approved')
        ORDER BY COALESCE(ends_at, created_at), created_at
      `);
      const bidsResult = await client.query(`
        SELECT lots.slug AS lot_slug, bids.amount, bids.kind, bids.created_at AS bid_created_at,
               users.email AS bid_user, users.display_name AS bidder_name
        FROM bids
        JOIN lots ON lots.id = bids.lot_id
        LEFT JOIN users ON users.id = bids.user_id
        WHERE bids.status = 'valid'
        ORDER BY bids.created_at DESC
      `);
      const proxyResult = await client.query(`
        SELECT lots.slug AS lot_slug, users.email AS bid_user, proxy_bids.max_amount
        FROM proxy_bids
        JOIN lots ON lots.id = proxy_bids.lot_id
        JOIN users ON users.id = proxy_bids.user_id
        WHERE proxy_bids.status = 'active'
      `);
      const buyNowResult = await client.query(`
        SELECT lots.slug AS lot_slug, users.email AS bid_user, buy_now_requests.price_amount, buy_now_requests.created_at
        FROM buy_now_requests
        JOIN lots ON lots.id = buy_now_requests.lot_id
        JOIN users ON users.id = buy_now_requests.user_id
        WHERE buy_now_requests.status = 'pending'
        ORDER BY buy_now_requests.created_at DESC
      `);
      const auditResult = await client.query(`
        SELECT actor_type, action, detail, created_at
        FROM audit_events
        ORDER BY created_at DESC
        LIMIT 500
      `);

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

  async userIdForClient(client, username) {
    const email = emailForUser(username);
    if (!email) return null;
    return (await client.query('SELECT id FROM users WHERE email = $1', [email])).rows[0]?.id || null;
  }

  async placeBidTx(user, { lotId, amount }) {
    const bidAmount = Number(amount);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const lot = (await client.query(`
        SELECT id, slug, current_bid_amount, bid_increment_amount, ends_at, anti_snipe_window_seconds,
               anti_snipe_extend_seconds, suspicious
        FROM lots WHERE slug = $1 FOR UPDATE
      `, [lotId])).rows[0];
      if (!lot) throw httpError('Lot not found', 404);
      if (Date.now() > time(lot.ends_at)) throw httpError('Auction ended', 400);
      const current = num(lot.current_bid_amount);
      const increment = num(lot.bid_increment_amount, 100);
      const min = current + increment;
      if (!Number.isFinite(bidAmount) || bidAmount < min) throw httpError(`Minimum next bid is ${money(min)}`, 400);
      if (bidAmount > user.limit) throw httpError(`${user.username}'s bid ceiling is ${money(user.limit)}`, 400);
      const userId = await this.userIdForClient(client, user.username);
      if (!userId) throw httpError('Bidder not found', 401);
      await client.query(`INSERT INTO bids (lot_id, user_id, amount, kind, status) VALUES ($1,$2,$3,'manual','valid')`, [lot.id, userId, bidAmount]);
      const suspicious = bidAmount >= current * 1.5 || Boolean(lot.suspicious);
      let endAt = time(lot.ends_at);
      const messages = [`Bid placed by ${user.username}: ${money(bidAmount)}`];
      if (endAt - Date.now() < num(lot.anti_snipe_window_seconds, 180) * 1000) {
        endAt += num(lot.anti_snipe_extend_seconds, 60) * 1000;
        messages.push('Anti-snipe: auction extended by 1 minute');
      }
      if (suspicious && bidAmount >= current * 1.5) messages.push('Manager alert: suspicious bid jump flagged');
      await client.query(`UPDATE lots SET current_bid_amount=$1, suspicious=$2, ends_at=$3, updated_at=now() WHERE id=$4`, [bidAmount, suspicious, date(endAt), lot.id]);
      await client.query(`INSERT INTO audit_events (actor_type, action, entity_type, entity_id, detail) VALUES ($1,'bid.placed','lot',$2,$3)`, [user.username, lot.id, { lotId, amount: bidAmount }]);

      const proxy = (await client.query(`
        SELECT proxy_bids.max_amount, users.id AS user_id, users.email, users.display_name
        FROM proxy_bids
        JOIN users ON users.id = proxy_bids.user_id
        WHERE proxy_bids.lot_id = $1 AND proxy_bids.status = 'active' AND users.email <> $2 AND proxy_bids.max_amount >= $3
        ORDER BY proxy_bids.max_amount DESC, proxy_bids.created_at ASC
        LIMIT 1
      `, [lot.id, emailForUser(user.username), bidAmount + increment])).rows[0];
      if (proxy) {
        const proxyBid = Math.min(num(proxy.max_amount), bidAmount + increment);
        await client.query(`INSERT INTO bids (lot_id, user_id, amount, kind, status) VALUES ($1,$2,$3,'proxy_auto','valid')`, [lot.id, proxy.user_id, proxyBid]);
        await client.query(`UPDATE lots SET current_bid_amount=$1, updated_at=now() WHERE id=$2`, [proxyBid, lot.id]);
        messages.push(`Outbid by ${usernameFromEmail(proxy.email)}'s proxy at ${money(proxyBid)}`);
      }
      await client.query('COMMIT');
      return { state: await this.readStateAsync(), message: messages.join(' • ') };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async saveProxyTx(user, { lotId, max }) {
    const maxAmount = Number(max);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const lot = (await client.query(`SELECT id, current_bid_amount, bid_increment_amount FROM lots WHERE slug=$1 FOR UPDATE`, [lotId])).rows[0];
      if (!lot) throw httpError('Lot not found', 404);
      const min = num(lot.current_bid_amount) + num(lot.bid_increment_amount, 100);
      if (!Number.isFinite(maxAmount) || maxAmount < min) throw httpError(`Proxy max must be at least ${money(min)}`, 400);
      if (maxAmount > user.limit) throw httpError(`${user.username}'s bid ceiling is ${money(user.limit)}`, 400);
      const userId = await this.userIdForClient(client, user.username);
      if (!userId) throw httpError('Bidder not found', 401);
      await client.query(`
        INSERT INTO proxy_bids (lot_id, user_id, max_amount, status)
        VALUES ($1,$2,$3,'active')
        ON CONFLICT (lot_id, user_id) DO UPDATE SET max_amount=EXCLUDED.max_amount, status='active', updated_at=now()
      `, [lot.id, userId, maxAmount]);
      await client.query(`INSERT INTO audit_events (actor_type, action, entity_type, entity_id, detail) VALUES ($1,'proxy.saved','lot',$2,$3)`, [user.username, lot.id, { lotId, max: maxAmount }]);
      const messages = [`${user.username}'s proxy saved up to ${money(maxAmount)}`];
      const leader = (await client.query(`SELECT user_id FROM bids WHERE lot_id=$1 AND status='valid' ORDER BY amount DESC, created_at ASC LIMIT 1`, [lot.id])).rows[0];
      if (leader?.user_id !== userId && num(lot.current_bid_amount) + num(lot.bid_increment_amount, 100) <= maxAmount) {
        const proxyBid = num(lot.current_bid_amount) + num(lot.bid_increment_amount, 100);
        await client.query(`INSERT INTO bids (lot_id, user_id, amount, kind, status) VALUES ($1,$2,$3,'proxy_auto','valid')`, [lot.id, userId, proxyBid]);
        await client.query(`UPDATE lots SET current_bid_amount=$1, updated_at=now() WHERE id=$2`, [proxyBid, lot.id]);
        messages.push(`Proxy placed current bid at ${money(proxyBid)}`);
      }
      await client.query('COMMIT');
      return { state: await this.readStateAsync(), message: messages.join(' • ') };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async requestBuyNowTx(user, { lotId }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const lot = (await client.query(`SELECT id, buy_now_amount FROM lots WHERE slug=$1 FOR UPDATE`, [lotId])).rows[0];
      if (!lot) throw httpError('Lot not found', 404);
      const userId = await this.userIdForClient(client, user.username);
      if (!userId) throw httpError('Bidder not found', 401);
      await client.query(`INSERT INTO buy_now_requests (lot_id, user_id, price_amount, status) VALUES ($1,$2,$3,'pending')`, [lot.id, userId, num(lot.buy_now_amount)]);
      await client.query(`INSERT INTO audit_events (actor_type, action, entity_type, entity_id, detail) VALUES ($1,'buy_now.requested','lot',$2,$3)`, [user.username, lot.id, { lotId, price: num(lot.buy_now_amount) }]);
      await client.query('COMMIT');
      return { state: await this.readStateAsync(), message: 'Buy Now request sent to manager. Auction stays live.' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async adminOpenLotsTx(hours) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const lots = (await client.query(`SELECT id FROM lots WHERE status <> 'cancelled' ORDER BY COALESCE(ends_at, created_at), created_at FOR UPDATE`)).rows;
      for (let i = 0; i < lots.length; i++) {
        await client.query(`UPDATE lots SET status='live', ends_at=$1, updated_at=now() WHERE id=$2`, [date(Date.now() + (hours * 60 * 60 * 1000) + i * 7 * 60 * 1000), lots[i].id]);
      }
      await client.query(`INSERT INTO audit_events (actor_type, action, detail) VALUES ('admin','lots.open_hours',$1)`, [{ hours }]);
      await client.query('COMMIT');
      return { state: await this.readStateAsync(), message: `All auctions opened for about ${hours} hours` };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async adminSaveLotTx(input) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const slug = String(input.id || input.model || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `lot-${Date.now()}`;
      const endAt = input.endAt ? new Date(input.endAt) : date(input.endAtMs || Date.now() + 8 * 60 * 60 * 1000);
      const existing = (await client.query('SELECT id FROM lots WHERE slug=$1 FOR UPDATE', [slug])).rows[0];
      const result = await client.query(`
        INSERT INTO lots (
          slug, brand, model, equipment_type, manufacture_year, usage_label, location, status,
          starting_price_amount, current_bid_amount, buy_now_amount, bid_increment_amount,
          starts_at, ends_at, published_at, image_key, ui_accent, ui_shape, suspicious
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'live',$8,$8,$9,$10,now(),$11,now(),$12,$13,$14,false)
        ON CONFLICT (slug) DO UPDATE SET
          brand=EXCLUDED.brand,
          model=EXCLUDED.model,
          equipment_type=EXCLUDED.equipment_type,
          manufacture_year=EXCLUDED.manufacture_year,
          usage_label=EXCLUDED.usage_label,
          location=EXCLUDED.location,
          current_bid_amount=EXCLUDED.current_bid_amount,
          buy_now_amount=EXCLUDED.buy_now_amount,
          bid_increment_amount=EXCLUDED.bid_increment_amount,
          ends_at=EXCLUDED.ends_at,
          image_key=EXCLUDED.image_key,
          ui_accent=EXCLUDED.ui_accent,
          ui_shape=EXCLUDED.ui_shape,
          status='live',
          updated_at=now()
        RETURNING id
      `, [
        slug,
        String(input.brand || 'SHACMAN').toUpperCase(),
        input.model || 'New Auction Lot',
        input.type || 'Heavy Truck',
        input.year || new Date().getFullYear(),
        input.hours || '0 h',
        input.location || 'Tbilisi Yard',
        input.current || 0,
        input.buyNow || 0,
        input.increment || 1000,
        endAt,
        input.imageKey || slug,
        '#56B461',
        'truck',
      ]);
      if (!existing) {
        await client.query(`INSERT INTO bids (lot_id, user_id, amount, kind, status) VALUES ($1,NULL,$2,'opening','valid')`, [result.rows[0].id, input.current || 0]);
      }
      await client.query(`INSERT INTO audit_events (actor_type, action, entity_type, entity_id, detail) VALUES ('admin',$1,'lot',$2,$3)`, [existing ? 'lot.updated' : 'lot.added', result.rows[0].id, { lotId: slug, model: input.model }]);
      await client.query('COMMIT');
      return { state: await this.readStateAsync(), message: existing ? 'Lot updated' : 'Lot added' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async adminRemoveLotTx(slug) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const lot = (await client.query(`SELECT id, model FROM lots WHERE slug=$1 FOR UPDATE`, [slug])).rows[0];
      if (lot) {
        await client.query(`UPDATE lots SET status='cancelled', updated_at=now() WHERE id=$1`, [lot.id]);
        await client.query(`INSERT INTO audit_events (actor_type, action, entity_type, entity_id, detail) VALUES ('admin','lot.removed','lot',$1,$2)`, [lot.id, { lotId: slug, model: lot.model }]);
      }
      await client.query('COMMIT');
      return { state: await this.readStateAsync(), message: 'Lot removed' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
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
