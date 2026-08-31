-- 009_fullstack_production.sql
-- Idempotent Solana Pay requests, integration reconciliation support and production indexes.
BEGIN;

ALTER TABLE solana_pay_requests
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS request_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS solana_pay_requests_subject_idempotency_idx
  ON solana_pay_requests(subject_id,idempotency_key)
  WHERE subject_id IS NOT NULL AND idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS solana_pay_requests_status_updated_idx
  ON solana_pay_requests(status,updated_at);

CREATE INDEX IF NOT EXISTS cctp_intents_pending_indexer_idx
  ON cctp_intents(status,updated_at)
  WHERE status IN ('BURN_SUBMITTED','ATTESTING','ATTESTED','MINT_SUBMITTED');
CREATE INDEX IF NOT EXISTS swap_intents_pending_indexer_idx
  ON swap_intents(status,updated_at)
  WHERE status IN ('SUBMITTED','FINALIZED');

INSERT INTO schema_migrations(version,checksum,applied_at)
VALUES('009_fullstack_production','managed-by-migrate-script',now())
ON CONFLICT (version) DO NOTHING;

COMMIT;
