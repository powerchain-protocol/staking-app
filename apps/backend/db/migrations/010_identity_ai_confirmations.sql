BEGIN;

ALTER TABLE auth_challenges ADD COLUMN IF NOT EXISTS subject_id text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS auth_provider text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;

CREATE TABLE IF NOT EXISTS action_confirmation_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL,
  wallet_address text NOT NULL,
  network text NOT NULL CHECK (network IN ('SOLANA','SUI')),
  action text NOT NULL,
  action_hash text NOT NULL,
  nonce text NOT NULL UNIQUE,
  message text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS action_confirmation_challenges_subject_idx ON action_confirmation_challenges(subject_id,created_at DESC);

CREATE TABLE IF NOT EXISTS action_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL UNIQUE REFERENCES action_confirmation_challenges(id),
  subject_id text NOT NULL,
  wallet_address text NOT NULL,
  action text NOT NULL,
  action_hash text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS action_confirmations_lookup_idx ON action_confirmations(subject_id,action,expires_at DESC) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS platform_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  subject_id text,
  source text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')) DEFAULT 'INFO',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_events_subject_idx ON platform_events(subject_id,created_at DESC);
CREATE INDEX IF NOT EXISTS platform_events_type_idx ON platform_events(event_type,created_at DESC);

CREATE TABLE IF NOT EXISTS ai_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL,
  model text NOT NULL,
  request_hash text NOT NULL,
  prompt_bytes integer NOT NULL CHECK (prompt_bytes >= 0),
  status text NOT NULL CHECK (status IN ('ACCEPTED','COMPLETED','REJECTED','FAILED')),
  policy_version text NOT NULL,
  provider_request_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS ai_requests_subject_idx ON ai_requests(subject_id,created_at DESC);

INSERT INTO execution_controls(control_key,enabled) VALUES ('AI',true)
ON CONFLICT(control_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS auth_users (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, email_verified boolean NOT NULL DEFAULT false, image text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_sessions_better (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE, token text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, ip_address text, user_agent text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_better_user_idx ON auth_sessions_better(user_id);
CREATE TABLE IF NOT EXISTS auth_accounts (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE, account_id text NOT NULL, provider_id text NOT NULL, access_token text, refresh_token text, access_token_expires_at timestamptz, refresh_token_expires_at timestamptz, scope text, id_token text, password text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_accounts_user_idx ON auth_accounts(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS auth_accounts_provider_uq ON auth_accounts(provider_id,account_id);
CREATE TABLE IF NOT EXISTS auth_verifications (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_verifications_identifier_idx ON auth_verifications(identifier);

COMMIT;
