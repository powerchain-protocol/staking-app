BEGIN;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY,
  subject_id text NOT NULL,
  wallet_address text NOT NULL,
  network text NOT NULL CHECK (network IN ('SOLANA','SUI')),
  wallet_kind text NOT NULL CHECK (wallet_kind IN ('EXTERNAL','EMBEDDED')),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_subject_idx ON auth_sessions(subject_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS auth_sessions_wallet_idx ON auth_sessions(network, wallet_address, expires_at DESC);
CREATE INDEX IF NOT EXISTS auth_sessions_active_idx ON auth_sessions(expires_at) WHERE revoked_at IS NULL;

-- Expired challenges and sessions are security records, but routine cleanup is safe once
-- they are outside the configured audit-retention window. Application code never mutates
-- the identity attributes of an issued session.

COMMIT;
