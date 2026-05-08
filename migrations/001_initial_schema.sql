-- GT Auction production schema draft
-- Target: PostgreSQL 15+

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_status AS ENUM ('pending', 'approved', 'blocked');
CREATE TYPE admin_role AS ENUM ('representative', 'manager', 'super_admin');
CREATE TYPE admin_status AS ENUM ('active', 'disabled');
CREATE TYPE lot_status AS ENUM ('draft', 'scheduled', 'live', 'ended', 'pending_approval', 'approved', 'cancelled');
CREATE TYPE asset_kind AS ENUM ('photo', 'inspection_report', 'document');
CREATE TYPE bid_kind AS ENUM ('opening', 'manual', 'proxy_auto', 'admin_adjustment');
CREATE TYPE bid_status AS ENUM ('valid', 'retracted', 'cancelled', 'rejected');
CREATE TYPE proxy_status AS ENUM ('active', 'cancelled', 'exhausted');
CREATE TYPE request_status AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');
CREATE TYPE result_status AS ENUM ('pending_approval', 'approved', 'cancelled');
CREATE TYPE payment_status AS ENUM ('not_started', 'pending', 'paid', 'failed', 'cancelled');
CREATE TYPE delivery_status AS ENUM ('not_started', 'scheduled', 'picked_up', 'delivered', 'cancelled');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status user_status NOT NULL DEFAULT 'pending',
  bid_limit_amount NUMERIC(14,2),
  email_verified_at TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CHECK (bid_limit_amount IS NULL OR bid_limit_amount >= 0)
);

CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role admin_role NOT NULL DEFAULT 'representative',
  status admin_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  equipment_type TEXT NOT NULL,
  manufacture_year INTEGER,
  usage_label TEXT,
  location TEXT NOT NULL,
  description TEXT,
  condition_notes TEXT,
  status lot_status NOT NULL DEFAULT 'draft',
  starting_price_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_bid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  reserve_price_amount NUMERIC(14,2),
  buy_now_amount NUMERIC(14,2),
  bid_increment_amount NUMERIC(14,2) NOT NULL DEFAULT 100,
  anti_snipe_window_seconds INTEGER NOT NULL DEFAULT 180,
  anti_snipe_extend_seconds INTEGER NOT NULL DEFAULT 60,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES admin_users(id),
  updated_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (starting_price_amount >= 0),
  CHECK (current_bid_amount >= 0),
  CHECK (bid_increment_amount > 0),
  CHECK (reserve_price_amount IS NULL OR reserve_price_amount >= 0),
  CHECK (buy_now_amount IS NULL OR buy_now_amount >= 0),
  CHECK (manufacture_year IS NULL OR manufacture_year BETWEEN 1980 AND 2100)
);

CREATE TABLE lot_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  kind asset_kind NOT NULL,
  url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES lots(id),
  user_id UUID REFERENCES users(id),
  amount NUMERIC(14,2) NOT NULL,
  kind bid_kind NOT NULL DEFAULT 'manual',
  status bid_status NOT NULL DEFAULT 'valid',
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (amount >= 0),
  CHECK ((kind = 'opening' AND user_id IS NULL) OR (kind <> 'opening' AND user_id IS NOT NULL))
);

CREATE INDEX bids_lot_amount_idx ON bids (lot_id, amount DESC, created_at ASC) WHERE status = 'valid';
CREATE INDEX bids_user_idx ON bids (user_id, created_at DESC);

CREATE TABLE proxy_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES lots(id),
  user_id UUID NOT NULL REFERENCES users(id),
  max_amount NUMERIC(14,2) NOT NULL,
  status proxy_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lot_id, user_id),
  CHECK (max_amount > 0)
);

CREATE TABLE buy_now_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES lots(id),
  user_id UUID NOT NULL REFERENCES users(id),
  price_amount NUMERIC(14,2) NOT NULL,
  status request_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES admin_users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (price_amount >= 0)
);

CREATE TABLE auction_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL UNIQUE REFERENCES lots(id),
  winning_bid_id UUID REFERENCES bids(id),
  winner_user_id UUID REFERENCES users(id),
  fallback_bid_id UUID REFERENCES bids(id),
  fallback_user_id UUID REFERENCES users(id),
  final_amount NUMERIC(14,2),
  status result_status NOT NULL DEFAULT 'pending_approval',
  manager_id UUID REFERENCES admin_users(id),
  decision_reason TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE handoff_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES auction_results(id),
  responsible_admin_id UUID REFERENCES admin_users(id),
  payment_status payment_status NOT NULL DEFAULT 'not_started',
  delivery_status delivery_status NOT NULL DEFAULT 'not_started',
  payment_notes TEXT,
  delivery_notes TEXT,
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type TEXT NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_events_actor_idx ON audit_events (actor_type, actor_id, created_at DESC);
CREATE INDEX lots_status_ends_idx ON lots (status, ends_at);
