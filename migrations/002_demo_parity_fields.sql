-- Fields needed to preserve current demo UI/API shape while PostgreSQL parity is built.
-- These can later be replaced by richer asset/branding records.

ALTER TABLE lots
  ADD COLUMN IF NOT EXISTS image_key TEXT,
  ADD COLUMN IF NOT EXISTS ui_accent TEXT,
  ADD COLUMN IF NOT EXISTS ui_shape TEXT,
  ADD COLUMN IF NOT EXISTS suspicious BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS lots_slug_idx ON lots (slug);
