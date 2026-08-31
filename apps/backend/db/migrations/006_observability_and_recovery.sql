BEGIN;

-- Recovery metadata is explicit so repeated administrative requeues remain auditable.
ALTER TABLE reconciliation_exceptions ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0);
ALTER TABLE reconciliation_exceptions ADD COLUMN IF NOT EXISTS last_retry_at timestamptz;
ALTER TABLE reconciliation_exceptions ADD COLUMN IF NOT EXISTS last_retried_by text;
CREATE INDEX IF NOT EXISTS reconciliation_exceptions_retry_idx ON reconciliation_exceptions(resolved_at,retry_count,created_at DESC);

-- Request traces are retained only for state-changing calls in mutation_audit_events.
-- Index traceable request ids for incident correlation without introducing a second full request-log table.
CREATE INDEX IF NOT EXISTS mutation_audit_events_request_idx ON mutation_audit_events(request_id,created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_request_idx ON security_events(request_id,created_at DESC) WHERE request_id IS NOT NULL;

COMMIT;
