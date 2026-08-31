BEGIN;

-- Canonical migration registry (the migrator creates this before applying files too).
CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotent journal guard. Ledger entries remain append-only, but every business source
-- may create at most one canonical journal for an asset.
CREATE TABLE IF NOT EXISTS ledger_journals (
  journal_id uuid PRIMARY KEY,
  source_type text NOT NULL,
  source_id text NOT NULL,
  asset text NOT NULL,
  line_count integer NOT NULL CHECK (line_count >= 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_type, source_id, asset)
);

-- Linear receipt-chain head. This prevents concurrent receipt writers from creating
-- two receipts that both point at the same predecessor.
INSERT INTO ledger_journals(journal_id,source_type,source_id,asset,line_count)
SELECT journal_id,source_type,source_id,asset,COUNT(*)::integer FROM ledger_entries GROUP BY journal_id,source_type,source_id,asset
ON CONFLICT(source_type,source_id,asset) DO NOTHING;

CREATE TABLE IF NOT EXISTS receipt_chain_heads (
  chain_name text PRIMARY KEY,
  sequence bigint NOT NULL DEFAULT 0,
  head_hash text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO receipt_chain_heads(chain_name) VALUES('POWERCHAIN_STAKING_V1') ON CONFLICT DO NOTHING;

ALTER TABLE immutable_receipts ADD COLUMN IF NOT EXISTS chain_name text NOT NULL DEFAULT 'POWERCHAIN_STAKING_V1';
ALTER TABLE immutable_receipts ADD COLUMN IF NOT EXISTS sequence bigint;
ALTER TABLE immutable_receipts ADD COLUMN IF NOT EXISTS receipt_version integer NOT NULL DEFAULT 1;
ALTER TABLE immutable_receipts ADD COLUMN IF NOT EXISTS receipt_seal text;
UPDATE immutable_receipts SET chain_name='LEGACY_PRE_HARDENING' WHERE sequence IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS immutable_receipts_chain_sequence_uq
  ON immutable_receipts(chain_name, sequence) WHERE sequence IS NOT NULL;

ALTER TABLE reward_epochs ADD COLUMN IF NOT EXISTS skipped_atomic numeric(40,0) NOT NULL DEFAULT 0 CHECK (skipped_atomic >= 0);

CREATE TABLE IF NOT EXISTS reward_claim_allocations (
  claim_id uuid NOT NULL REFERENCES reward_claims(id),
  epoch_id uuid NOT NULL REFERENCES reward_epochs(id),
  amount_atomic numeric(40,0) NOT NULL CHECK (amount_atomic >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(claim_id, epoch_id)
);
CREATE INDEX IF NOT EXISTS reward_claim_allocations_epoch_idx ON reward_claim_allocations(epoch_id, created_at DESC);

INSERT INTO reward_claim_allocations(claim_id,epoch_id,amount_atomic) SELECT id,epoch_id,amount_atomic FROM reward_claims WHERE epoch_id IS NOT NULL ON CONFLICT DO NOTHING;

-- Reward-vault control rows provide a lock target so concurrent epoch creation cannot
-- overcommit the same funded vault.
CREATE TABLE IF NOT EXISTS reward_vault_controls (
  network text NOT NULL,
  vault_address text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(network, vault_address)
);

CREATE TABLE IF NOT EXISTS reward_vault_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL,
  vault_address text NOT NULL,
  balance_atomic numeric(50,0) NOT NULL,
  accrued_liability_atomic numeric(50,0) NOT NULL,
  committed_unemitted_atomic numeric(50,0) NOT NULL,
  available_after_commitments_atomic numeric(50,0) NOT NULL,
  covered boolean NOT NULL,
  slot bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reward_vault_snapshots_vault_idx ON reward_vault_snapshots(network, vault_address, created_at DESC);

-- Reconciliation lease prevents overlapping full workers from mutating reward indexes
-- and intent state concurrently.
CREATE TABLE IF NOT EXISTS worker_leases (
  lease_name text PRIMARY KEY,
  owner_id text NOT NULL,
  lease_token uuid NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT now()
);

-- Lightweight database-backed rate limiter for security-sensitive API surfaces.
CREATE TABLE IF NOT EXISTS rate_limit_windows (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  hit_count integer NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(bucket_key, window_start)
);
CREATE INDEX IF NOT EXISTS rate_limit_windows_expiry_idx ON rate_limit_windows(expires_at);

-- Helius webhook ingestion is deliberately durable-and-ack-fast: the receiver writes
-- the event, returns 200, and reconciliation processes it asynchronously.
CREATE TABLE IF NOT EXISTS chain_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  network text NOT NULL,
  event_key text NOT NULL,
  signature text,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text,
  UNIQUE(provider, network, event_key)
);
CREATE INDEX IF NOT EXISTS chain_webhook_events_pending_idx ON chain_webhook_events(processed_at, received_at);
CREATE INDEX IF NOT EXISTS chain_webhook_events_signature_idx ON chain_webhook_events(signature) WHERE signature IS NOT NULL;

-- Transaction observations preserve finality/reconciliation evidence independently of
-- the mutable intent row.
CREATE TABLE IF NOT EXISTS transaction_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL,
  signature text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  confirmation_status text,
  slot bigint,
  block_time timestamptz,
  error jsonb,
  expected_program text,
  observed_program boolean,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transaction_observations_source_idx ON transaction_observations(source_type, source_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS transaction_observations_signature_idx ON transaction_observations(signature, observed_at DESC);

-- Governance execution gets an explicit timelock and execution timestamps.
ALTER TABLE governance_proposals ADD COLUMN IF NOT EXISTS execution_not_before timestamptz;
ALTER TABLE governance_proposals ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE governance_proposals ADD COLUMN IF NOT EXISTS executed_at timestamptz;
ALTER TABLE governance_proposals ADD COLUMN IF NOT EXISTS execution_policy_version text;

ALTER TABLE governance_intents ADD COLUMN IF NOT EXISTS request_hash text;
ALTER TABLE service_bond_intents ADD COLUMN IF NOT EXISTS request_hash text;

ALTER TABLE staking_intents ADD COLUMN IF NOT EXISTS reconciliation_claimed_at timestamptz;
ALTER TABLE governance_intents ADD COLUMN IF NOT EXISTS reconciliation_claimed_at timestamptz;
ALTER TABLE service_bond_intents ADD COLUMN IF NOT EXISTS reconciliation_claimed_at timestamptz;

-- Intent expiry prevents stale blockhash/prepared transaction reuse.
ALTER TABLE staking_intents ADD COLUMN IF NOT EXISTS prepared_expires_at timestamptz;
ALTER TABLE governance_intents ADD COLUMN IF NOT EXISTS prepared_expires_at timestamptz;
ALTER TABLE service_bond_intents ADD COLUMN IF NOT EXISTS prepared_expires_at timestamptz;

-- Bridge snapshots gain explicit verification status for operational policy/alerting.
ALTER TABLE bridge_reserve_snapshots ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'VERIFIED';
ALTER TABLE bridge_reserve_snapshots ADD COLUMN IF NOT EXISTS bridge_program_verified boolean;
ALTER TABLE bridge_reserve_snapshots ADD COLUMN IF NOT EXISTS reserve_authority_verified boolean;

-- Immutable tables cannot be mutated by application roles.
DROP TRIGGER IF EXISTS transaction_observations_immutable_update ON transaction_observations;
DROP TRIGGER IF EXISTS transaction_observations_immutable_delete ON transaction_observations;
CREATE TRIGGER transaction_observations_immutable_update BEFORE UPDATE ON transaction_observations FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();
CREATE TRIGGER transaction_observations_immutable_delete BEFORE DELETE ON transaction_observations FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

COMMIT;
