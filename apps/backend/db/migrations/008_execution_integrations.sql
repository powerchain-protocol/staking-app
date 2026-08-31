BEGIN;

ALTER TABLE cctp_intents
  ADD COLUMN IF NOT EXISTS transfer_mode text NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS max_fee_atomic numeric(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_finality_threshold integer NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS prepared_blockhash text,
  ADD COLUMN IF NOT EXISTS last_valid_block_height bigint,
  ADD COLUMN IF NOT EXISTS prepared_message_hash text,
  ADD COLUMN IF NOT EXISTS prepared_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS event_account text,
  ADD COLUMN IF NOT EXISTS attestation_status text,
  ADD COLUMN IF NOT EXISTS destination_prepare_payload jsonb,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_detail text;

CREATE INDEX IF NOT EXISTS cctp_intents_subject_created_idx ON cctp_intents(subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cctp_intents_source_tx_idx ON cctp_intents(source_tx) WHERE source_tx IS NOT NULL;
CREATE INDEX IF NOT EXISTS cctp_intents_status_idx ON cctp_intents(status, updated_at);

ALTER TABLE swap_intents
  ADD COLUMN IF NOT EXISTS prepared_transaction_base64 text,
  ADD COLUMN IF NOT EXISTS prepared_message_hash text,
  ADD COLUMN IF NOT EXISTS prepared_blockhash text,
  ADD COLUMN IF NOT EXISTS last_valid_block_height bigint,
  ADD COLUMN IF NOT EXISTS prepared_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_route_id text,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_detail text;

CREATE INDEX IF NOT EXISTS swap_intents_status_idx ON swap_intents(status, updated_at);
CREATE INDEX IF NOT EXISTS swap_intents_transaction_idx ON swap_intents(transaction_id) WHERE transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS integration_execution_events (
  id bigserial PRIMARY KEY,
  subject_id text REFERENCES users(id) ON DELETE SET NULL,
  integration_id text NOT NULL,
  action text NOT NULL,
  intent_id text,
  chain text,
  network text,
  transaction_id text,
  status text NOT NULL,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_execution_events_subject_created_idx ON integration_execution_events(subject_id,created_at DESC);
CREATE INDEX IF NOT EXISTS integration_execution_events_intent_idx ON integration_execution_events(intent_id,created_at DESC);

INSERT INTO action_registry(action_id,title,description,method,endpoint,execution_domain,enabled,metadata,updated_at) VALUES
('stake.create','Stake PWRC','Create a wallet-approved PWRC staking intent','POST','/api/v1/staking/intents','STAKING',true,'{"version":"1.0.0"}',now()),
('reward.claim','Claim PWRC rewards','Claim funded reconciled PWRC staking rewards','POST','/api/v1/staking/intents','REWARDS',true,'{"version":"1.0.0"}',now()),
('governance.vote','Vote on proposal','Create a wallet-approved governance vote','POST','/api/v1/governance/intents','GOVERNANCE',true,'{"version":"1.0.0"}',now()),
('swap.prepare','Swap assets','Quote and prepare an approved DEX swap','POST','/api/v1/swaps/intents','TRANSFERS',true,'{"version":"1.0.0"}',now()),
('bridge.cctp','Bridge USDC with CCTP V2','Prepare a wallet-approved Circle CCTP V2 burn','POST','/api/v1/cctp/intents','BRIDGE',true,'{"version":"1.0.0"}',now()),
('solana.pay','Create Solana Pay request','Create an authoritative Solana Pay payment request','POST','/api/v1/solana-pay/requests','TRANSFERS',true,'{"version":"1.0.0"}',now())
ON CONFLICT(action_id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,method=EXCLUDED.method,endpoint=EXCLUDED.endpoint,execution_domain=EXCLUDED.execution_domain,metadata=EXCLUDED.metadata,updated_at=now();

INSERT INTO schema_migrations(version,checksum,applied_at)
VALUES('008_execution_integrations','managed-by-migrate-script',now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
