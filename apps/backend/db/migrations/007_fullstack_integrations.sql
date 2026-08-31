-- 007_fullstack_integrations.sql
-- User/profile, integration, portfolio, swap, CCTP, ZK and Solana Pay domain state.
BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  primary_wallet text,
  primary_network text CHECK (primary_network IS NULL OR primary_network IN ('SOLANA','SUI')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  subject_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username text UNIQUE,
  display_name text,
  avatar_url text,
  bio text,
  country_code text,
  organization text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_settings (
  subject_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'en',
  currency text NOT NULL DEFAULT 'USD',
  theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light','dark','system')),
  notifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  privacy jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS linked_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('WALLET_SOLANA','WALLET_SUI','SUPABASE')),
  provider_subject text NOT NULL,
  wallet_address text,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id bigserial PRIMARY KEY,
  subject_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  network text NOT NULL,
  total_value_usd numeric(30,10) NOT NULL DEFAULT 0,
  assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portfolio_snapshots_subject_created_idx ON portfolio_snapshots(subject_id,created_at DESC);

CREATE TABLE IF NOT EXISTS integration_health_snapshots (
  id bigserial PRIMARY KEY,
  integration_id text NOT NULL,
  network text NOT NULL,
  status text NOT NULL CHECK (status IN ('ENABLED','DISABLED','DEGRADED','UNCONFIGURED')),
  latency_ms integer,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_health_id_created_idx ON integration_health_snapshots(integration_id,created_at DESC);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id bigserial PRIMARY KEY,
  symbol text NOT NULL,
  asset_address text,
  currency text NOT NULL DEFAULT 'USD',
  price numeric(38,18) NOT NULL CHECK (price >= 0),
  source text NOT NULL,
  confidence numeric(38,18),
  source_timestamp timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_snapshots_symbol_created_idx ON price_snapshots(symbol,created_at DESC);

CREATE TABLE IF NOT EXISTS swap_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  wallet_address text NOT NULL,
  chain text NOT NULL CHECK (chain IN ('SOLANA','SUI')),
  provider text NOT NULL CHECK (provider IN ('JUPITER','METEORA','ORCA','RAYDIUM','CETUS','DEEPBOOK')),
  input_asset text NOT NULL,
  output_asset text NOT NULL,
  input_atomic numeric(78,0) NOT NULL CHECK (input_atomic > 0),
  expected_output_atomic numeric(78,0) NOT NULL CHECK (expected_output_atomic > 0),
  minimum_output_atomic numeric(78,0),
  slippage_bps integer NOT NULL CHECK (slippage_bps BETWEEN 1 AND 5000),
  quote jsonb NOT NULL,
  status text NOT NULL DEFAULT 'QUOTED' CHECK (status IN ('QUOTED','PREPARED','AWAITING_SIGNATURE','SUBMITTED','FINALIZED','RECONCILED','FAILED','EXPIRED','CANCELLED')),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  transaction_id text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subject_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS swap_intents_subject_created_idx ON swap_intents(subject_id,created_at DESC);

CREATE TABLE IF NOT EXISTS cctp_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  wallet_address text NOT NULL,
  source_domain integer NOT NULL CHECK (source_domain >= 0),
  destination_domain integer NOT NULL CHECK (destination_domain >= 0),
  amount_atomic numeric(78,0) NOT NULL CHECK (amount_atomic > 0),
  recipient text NOT NULL,
  status text NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','QUOTED','AWAITING_SIGNATURE','BURN_SUBMITTED','ATTESTING','ATTESTED','MINT_SUBMITTED','RECONCILED','FAILED','EXPIRED','CANCELLED')),
  source_tx text,
  destination_tx text,
  message_hash text,
  attestation text,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subject_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS solana_pay_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text REFERENCES users(id) ON DELETE SET NULL,
  recipient text NOT NULL,
  amount_atomic numeric(78,0) NOT NULL CHECK (amount_atomic > 0),
  decimals integer NOT NULL CHECK (decimals BETWEEN 0 AND 18),
  token_mint text,
  reference_address text NOT NULL UNIQUE,
  label text,
  message text,
  memo text,
  payment_url text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PAID','RECONCILED','EXPIRED','CANCELLED')),
  signature text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zk_verification_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text REFERENCES users(id) ON DELETE SET NULL,
  circuit text NOT NULL,
  public_inputs_hash text NOT NULL,
  proof_hash text NOT NULL,
  valid boolean NOT NULL,
  provider_proof_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zk_verification_subject_created_idx ON zk_verification_records(subject_id,created_at DESC);

CREATE TABLE IF NOT EXISTS leaderboard_scores (
  subject_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  staking_score numeric(30,6) NOT NULL DEFAULT 0,
  governance_score numeric(30,6) NOT NULL DEFAULT 0,
  network_score numeric(30,6) NOT NULL DEFAULT 0,
  community_score numeric(30,6) NOT NULL DEFAULT 0,
  total_score numeric(30,6) GENERATED ALWAYS AS (staking_score + governance_score + network_score + community_score) STORED,
  policy_version text NOT NULL DEFAULT 'v1',
  calculated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leaderboard_scores_total_idx ON leaderboard_scores(total_score DESC);

CREATE TABLE IF NOT EXISTS action_registry (
  action_id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  method text NOT NULL,
  endpoint text NOT NULL,
  execution_domain text,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_cache_entries (
  cache_key text PRIMARY KEY,
  value jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_cache_entries_expires_idx ON app_cache_entries(expires_at);

INSERT INTO schema_migrations(version,checksum,applied_at)
VALUES('007_fullstack_integrations','managed-by-migrate-script',now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
