import { createConfig } from '../config.js';
import { createPool } from './pool.js';
import { seedLots, users } from '../storage/seedData.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../..');
const config = createConfig(root);
const pool = createPool(config);
const now = Date.now();

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO admin_users (email, password_hash, display_name, role, status)
      VALUES ('admin@example.local', 'demo-only-admin-password-admin', 'Demo Admin', 'super_admin', 'active')
      ON CONFLICT (email) DO NOTHING
    `);

    for (const user of users) {
      await client.query(`
        INSERT INTO users (email, phone, password_hash, display_name, status, bid_limit_amount, email_verified_at)
        VALUES ($1, NULL, $2, $3, 'approved', $4, now())
        ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, bid_limit_amount = EXCLUDED.bid_limit_amount
      `, [`${user.username}@example.local`, `demo-only-password-${user.password}`, user.name, user.limit]);
    }

    for (const lot of seedLots) {
      const endAt = new Date(now + lot.endsIn);
      await client.query(`
        INSERT INTO lots (
          slug, brand, model, equipment_type, manufacture_year, usage_label, location, status,
          starting_price_amount, current_bid_amount, buy_now_amount, bid_increment_amount,
          starts_at, ends_at, published_at, image_key, ui_accent, ui_shape
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'live',$8,$8,$9,$10,now(),$11,now(),$1,$12,$13)
        ON CONFLICT (slug) DO UPDATE SET
          brand = EXCLUDED.brand,
          model = EXCLUDED.model,
          equipment_type = EXCLUDED.equipment_type,
          manufacture_year = EXCLUDED.manufacture_year,
          usage_label = EXCLUDED.usage_label,
          location = EXCLUDED.location,
          current_bid_amount = EXCLUDED.current_bid_amount,
          buy_now_amount = EXCLUDED.buy_now_amount,
          bid_increment_amount = EXCLUDED.bid_increment_amount,
          ends_at = EXCLUDED.ends_at,
          image_key = EXCLUDED.image_key,
          ui_accent = EXCLUDED.ui_accent,
          ui_shape = EXCLUDED.ui_shape
      `, [lot.id, lot.brand, lot.model, lot.type, lot.year, lot.hours, lot.location, lot.current, lot.buyNow, lot.increment, endAt, lot.accent, lot.shape]);

      await client.query(`
        INSERT INTO bids (lot_id, user_id, amount, kind, status, created_at)
        SELECT lots.id, NULL, $2, 'opening', 'valid', now()
        FROM lots
        WHERE lots.slug = $1
          AND NOT EXISTS (SELECT 1 FROM bids WHERE bids.lot_id = lots.id AND bids.kind = 'opening')
      `, [lot.id, lot.current]);
    }

    await client.query(`
      INSERT INTO audit_events (actor_type, action, detail)
      VALUES ('system', 'demo.seeded', jsonb_build_object('lots', $1::int, 'users', $2::int))
    `, [seedLots.length, users.length]);
    await client.query('COMMIT');
    console.log(`Seeded demo data: ${seedLots.length} lots, ${users.length} users`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
