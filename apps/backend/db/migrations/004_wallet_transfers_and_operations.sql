BEGIN;

CREATE TABLE IF NOT EXISTS wallet_transfer_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL,
  wallet_address text NOT NULL,
  network text NOT NULL DEFAULT 'SOLANA' CHECK (network='SOLANA'),
  destination_owner text NOT NULL,
  destination_token_account text,
  amount_atomic numeric(40,0) NOT NULL CHECK (amount_atomic > 0),
  transfer_fee_atomic numeric(40,0) NOT NULL DEFAULT 0 CHECK (transfer_fee_atomic >= 0),
  net_amount_atomic numeric(40,0) NOT NULL CHECK (net_amount_atomic >= 0),
  creates_destination_account boolean NOT NULL DEFAULT false,
  estimated_network_fee_lamports bigint,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  quote_hash text NOT NULL,
  policy_version text NOT NULL,
  status text NOT NULL DEFAULT 'QUOTED',
  prepared_blockhash text,
  last_valid_block_height bigint,
  prepared_message_hash text,
  prepared_expires_at timestamptz,
  submitted_signature text,
  reconciliation_claimed_at timestamptz,
  finalized_at timestamptz,
  reconciled_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subject_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS wallet_transfer_intents_owner_idx ON wallet_transfer_intents(subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_transfer_intents_status_idx ON wallet_transfer_intents(status, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transfer_intents_signature_uq ON wallet_transfer_intents(submitted_signature) WHERE submitted_signature IS NOT NULL;

CREATE TABLE IF NOT EXISTS operational_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type text NOT NULL,
  status text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operational_snapshots_type_idx ON operational_snapshots(snapshot_type, created_at DESC);

-- Wallet transfers are mutable only while moving through their intent lifecycle.
-- Finalized accounting evidence remains in immutable ledger/receipt tables.

COMMIT;
