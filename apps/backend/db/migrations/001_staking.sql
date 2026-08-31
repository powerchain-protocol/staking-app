BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  network text NOT NULL CHECK (network IN ('SOLANA','SUI')),
  nonce text NOT NULL UNIQUE,
  message text NOT NULL,
  origin text NOT NULL,
  cluster text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS auth_challenges_wallet_idx ON auth_challenges(wallet_address, issued_at DESC);

CREATE TABLE IF NOT EXISTS wallet_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL,
  wallet_address text NOT NULL,
  network text NOT NULL CHECK (network IN ('SOLANA','SUI')),
  wallet_kind text NOT NULL CHECK (wallet_kind IN ('EXTERNAL','EMBEDDED')),
  provider text,
  provider_wallet_id text,
  provider_subject_id text,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(network, wallet_address)
);

ALTER TABLE wallet_links ADD COLUMN IF NOT EXISTS provider_subject_id text;

CREATE TABLE IF NOT EXISTS embedded_wallet_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL UNIQUE,
  network text NOT NULL CHECK (network IN ('SOLANA','SUI')),
  provider_session_id text,
  status text NOT NULL CHECK (status IN ('CREATED','PENDING','COMPLETED','EXPIRED','FAILED')) DEFAULT 'CREATED',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS staking_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL,
  wallet_address text NOT NULL,
  network text NOT NULL DEFAULT 'SOLANA',
  action text NOT NULL CHECK (action IN ('STAKE','INCREASE','REQUEST_UNSTAKE','CANCEL_UNSTAKE','WITHDRAW','CLAIM','COMPOUND')),
  pool_id text,
  position_id uuid,
  amount_atomic numeric(40,0),
  authoritative_reward_atomic numeric(40,0),
  reward_quote jsonb,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'CREATED',
  quote_hash text NOT NULL,
  policy_version text NOT NULL,
  prepared_blockhash text,
  last_valid_block_height bigint,
  prepared_message_hash text,
  submitted_signature text,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  reconciled_at timestamptz,
  UNIQUE(subject_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS staking_intents_status_idx ON staking_intents(status, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS staking_intents_signature_uq ON staking_intents(submitted_signature) WHERE submitted_signature IS NOT NULL;

CREATE TABLE IF NOT EXISTS staking_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_intent_id uuid NOT NULL UNIQUE REFERENCES staking_intents(id),
  subject_id text NOT NULL,
  wallet_address text NOT NULL,
  network text NOT NULL DEFAULT 'SOLANA',
  pool_id text NOT NULL,
  principal_atomic numeric(40,0) NOT NULL CHECK (principal_atomic >= 0),
  effective_weight_atomic numeric(60,0) NOT NULL CHECK (effective_weight_atomic >= 0),
  reward_index_entry numeric(60,0) NOT NULL DEFAULT 0,
  claimed_reward_atomic numeric(40,0) NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('ACTIVE','LOCKED','UNBONDING','WITHDRAWABLE','WITHDRAWN','SLASHED','CLOSED')),
  policy_version text NOT NULL,
  lock_started_at timestamptz NOT NULL,
  unlock_at timestamptz,
  unbonding_ends_at timestamptz,
  onchain_address text UNIQUE,
  created_signature text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staking_positions_owner_idx ON staking_positions(subject_id, status);

CREATE TABLE IF NOT EXISTS reward_epochs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL DEFAULT 'SOLANA',
  pool_id text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  budget_atomic numeric(40,0) NOT NULL CHECK (budget_atomic >= 0),
  emitted_atomic numeric(40,0) NOT NULL DEFAULT 0 CHECK (emitted_atomic >= 0),
  cumulative_index numeric(60,0) NOT NULL DEFAULT 0,
  index_scale numeric(40,0) NOT NULL DEFAULT 1000000000000000000,
  last_indexed_at timestamptz,
  reward_vault text NOT NULL,
  policy_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('SCHEDULED','ACTIVE','FINALIZING','FINALIZED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (emitted_atomic <= budget_atomic)
);
CREATE INDEX IF NOT EXISTS reward_epochs_active_idx ON reward_epochs(status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS position_reward_cursors (
  position_id uuid NOT NULL REFERENCES staking_positions(id),
  epoch_id uuid NOT NULL REFERENCES reward_epochs(id),
  index_entry numeric(60,0) NOT NULL,
  accrued_atomic numeric(40,0) NOT NULL DEFAULT 0,
  claimed_atomic numeric(40,0) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(position_id, epoch_id)
);

CREATE TABLE IF NOT EXISTS reward_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staking_intent_id uuid NOT NULL UNIQUE REFERENCES staking_intents(id),
  position_id uuid NOT NULL REFERENCES staking_positions(id),
  epoch_id uuid REFERENCES reward_epochs(id),
  amount_atomic numeric(40,0) NOT NULL CHECK (amount_atomic >= 0),
  signature text,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE TABLE IF NOT EXISTS governance_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onchain_proposal_id text NOT NULL UNIQUE,
  proposer_wallet text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT','ACTIVE','SUCCEEDED','DEFEATED','EXECUTED','CANCELLED')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  quorum_weight_atomic numeric(60,0) NOT NULL DEFAULT 0,
  for_weight_atomic numeric(60,0) NOT NULL DEFAULT 0,
  against_weight_atomic numeric(60,0) NOT NULL DEFAULT 0,
  abstain_weight_atomic numeric(60,0) NOT NULL DEFAULT 0,
  execution_payload jsonb,
  policy_version text NOT NULL,
  create_signature text,
  execute_signature text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS governance_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES governance_proposals(id),
  subject_id text NOT NULL,
  wallet_address text NOT NULL,
  choice text NOT NULL CHECK (choice IN ('FOR','AGAINST','ABSTAIN')),
  weight_atomic numeric(60,0) NOT NULL CHECK (weight_atomic >= 0),
  signature text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, wallet_address)
);

CREATE TABLE IF NOT EXISTS service_bonds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_intent_id uuid UNIQUE,
  subject_id text NOT NULL,
  wallet_address text NOT NULL,
  role text NOT NULL CHECK (role IN ('OPERATOR','VERIFIER')),
  service_type text NOT NULL,
  amount_atomic numeric(40,0) NOT NULL CHECK (amount_atomic >= 0),
  status text NOT NULL CHECK (status IN ('PENDING','ACTIVE','UNBONDING','WITHDRAWABLE','WITHDRAWN','SLASHED')),
  unbonding_ends_at timestamptz,
  slashable boolean NOT NULL DEFAULT true,
  policy_version text NOT NULL,
  onchain_address text UNIQUE,
  created_signature text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_bonds_owner_idx ON service_bonds(subject_id, role, status);
ALTER TABLE service_bonds ADD COLUMN IF NOT EXISTS unbonding_ends_at timestamptz;

CREATE TABLE IF NOT EXISTS governance_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL,
  wallet_address text NOT NULL,
  action text NOT NULL CHECK (action IN ('VOTE','EXECUTE')),
  proposal_id uuid NOT NULL REFERENCES governance_proposals(id),
  choice text CHECK (choice IN ('FOR','AGAINST','ABSTAIN')),
  voting_weight_atomic numeric(60,0),
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'CREATED',
  prepared_blockhash text,
  last_valid_block_height bigint,
  prepared_message_hash text,
  submitted_signature text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subject_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS service_bond_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL,
  wallet_address text NOT NULL,
  role text NOT NULL CHECK (role IN ('OPERATOR','VERIFIER')),
  action text NOT NULL CHECK (action IN ('BOND','INCREASE','REQUEST_UNBOND','WITHDRAW')),
  service_type text NOT NULL,
  bond_id uuid REFERENCES service_bonds(id),
  amount_atomic numeric(40,0),
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'CREATED',
  policy_version text NOT NULL,
  prepared_blockhash text,
  last_valid_block_height bigint,
  prepared_message_hash text,
  submitted_signature text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subject_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL,
  subject_id text,
  account_code text NOT NULL,
  asset text NOT NULL,
  amount_atomic numeric(50,0) NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_entries_journal_idx ON ledger_entries(journal_id);
CREATE INDEX IF NOT EXISTS ledger_entries_subject_idx ON ledger_entries(subject_id, created_at DESC);

CREATE TABLE IF NOT EXISTS immutable_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text,
  receipt_type text NOT NULL,
  source_id text NOT NULL,
  payload jsonb NOT NULL,
  previous_hash text,
  receipt_hash text NOT NULL UNIQUE,
  chain_signature text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(receipt_type, source_id)
);

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL,
  status text NOT NULL,
  processed_count integer NOT NULL DEFAULT 0,
  exception_count integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS reconciliation_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id text NOT NULL,
  code text NOT NULL,
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reconciliation_exceptions_open_idx ON reconciliation_exceptions(resolved_at, created_at DESC);

CREATE TABLE IF NOT EXISTS bridge_reserve_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solana_reserve_atomic numeric(50,0) NOT NULL,
  sui_wpwrc_supply_atomic numeric(50,0) NOT NULL,
  delta_atomic numeric(50,0) NOT NULL,
  covered boolean NOT NULL,
  solana_slot bigint,
  sui_supply_state text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION reject_immutable_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'immutable table: % operations are not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_entries_immutable_update ON ledger_entries;
DROP TRIGGER IF EXISTS ledger_entries_immutable_delete ON ledger_entries;
CREATE TRIGGER ledger_entries_immutable_update BEFORE UPDATE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();
CREATE TRIGGER ledger_entries_immutable_delete BEFORE DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

DROP TRIGGER IF EXISTS immutable_receipts_immutable_update ON immutable_receipts;
DROP TRIGGER IF EXISTS immutable_receipts_immutable_delete ON immutable_receipts;
CREATE TRIGGER immutable_receipts_immutable_update BEFORE UPDATE ON immutable_receipts FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();
CREATE TRIGGER immutable_receipts_immutable_delete BEFORE DELETE ON immutable_receipts FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();

COMMIT;
