BEGIN;

-- Runtime execution controls are deliberately independent from environment flags so
-- operators can pause a deployed system without rebuilding or rotating configuration.
CREATE TABLE IF NOT EXISTS execution_controls (
  control_key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  reason text,
  changed_by text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO execution_controls(control_key,enabled) VALUES
  ('GLOBAL',true),('STAKING',true),('GOVERNANCE',true),('BONDS',true),('TRANSFERS',true),('REWARDS',true),('BRIDGE',true)
ON CONFLICT(control_key) DO NOTHING;

ALTER TABLE reconciliation_exceptions ADD COLUMN IF NOT EXISTS resolution text;

CREATE TABLE IF NOT EXISTS security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  subject_id text,
  wallet_address text,
  request_id text,
  source text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_created_idx ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_severity_idx ON security_events(severity, created_at DESC);

CREATE TABLE IF NOT EXISTS mutation_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  subject_id text,
  wallet_address text,
  status_code integer NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mutation_audit_events_created_idx ON mutation_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS mutation_audit_events_subject_idx ON mutation_audit_events(subject_id, created_at DESC);

-- Webhook processing uses bounded retries and a dead-letter state instead of retrying
-- malformed or permanently failing events forever.
ALTER TABLE chain_webhook_events ADD COLUMN IF NOT EXISTS processing_attempts integer NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0);
ALTER TABLE chain_webhook_events ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE chain_webhook_events ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;
CREATE INDEX IF NOT EXISTS chain_webhook_events_retry_idx ON chain_webhook_events(dead_lettered_at, processed_at, next_attempt_at, received_at);

-- Operational alerts are deduplicated by fingerprint while active.
CREATE TABLE IF NOT EXISTS operational_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  alert_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('WARNING','CRITICAL')),
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS operational_alerts_active_uq ON operational_alerts(fingerprint) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS operational_alerts_open_idx ON operational_alerts(resolved_at, severity, last_seen_at DESC);

COMMIT;
