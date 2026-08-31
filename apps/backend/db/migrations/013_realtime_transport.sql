BEGIN;

CREATE TABLE IF NOT EXISTS realtime_access_tokens (
  jti uuid PRIMARY KEY,
  subject_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS realtime_access_tokens_expiry_idx ON realtime_access_tokens(expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS realtime_events (
  event_id bigserial PRIMARY KEY,
  topic text NOT NULL,
  event_type text NOT NULL,
  subject_id text,
  entity_type text,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS realtime_events_subject_cursor_idx ON realtime_events(subject_id,event_id DESC);
CREATE INDEX IF NOT EXISTS realtime_events_topic_cursor_idx ON realtime_events(topic,event_id DESC);
CREATE INDEX IF NOT EXISTS realtime_events_created_idx ON realtime_events(created_at DESC);

CREATE TABLE IF NOT EXISTS realtime_server_heartbeats (
  instance_id text PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  connections integer NOT NULL DEFAULT 0 CHECK (connections >= 0),
  event_cursor bigint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS realtime_server_heartbeats_seen_idx ON realtime_server_heartbeats(last_seen_at DESC);

CREATE OR REPLACE FUNCTION powerchain_realtime_emit() RETURNS trigger AS $$
DECLARE
  row_json jsonb;
  topic_name text;
  event_name text;
  subject_value text;
  entity_value text;
  status_value text;
  emitted_id bigint;
BEGIN
  row_json := to_jsonb(NEW);
  subject_value := row_json ->> 'subject_id';
  entity_value := COALESCE(row_json ->> 'id', row_json ->> 'onchain_proposal_id');
  status_value := row_json ->> 'status';

  topic_name := CASE TG_TABLE_NAME
    WHEN 'staking_intents' THEN 'staking.intent'
    WHEN 'staking_positions' THEN 'staking.position'
    WHEN 'reward_claims' THEN 'rewards.claim'
    WHEN 'reward_epochs' THEN 'rewards.epoch'
    WHEN 'reward_vault_snapshots' THEN 'rewards.coverage'
    WHEN 'governance_intents' THEN 'governance.intent'
    WHEN 'governance_proposals' THEN 'governance.proposal'
    WHEN 'service_bond_intents' THEN 'bonds.intent'
    WHEN 'service_bonds' THEN 'bonds.position'
    WHEN 'wallet_transfer_intents' THEN 'wallet.transfer'
    WHEN 'swap_intents' THEN 'swap.intent'
    WHEN 'cctp_intents' THEN 'bridge.cctp'
    WHEN 'bridge_reserve_snapshots' THEN 'bridge.reserve'
    WHEN 'operational_snapshots' THEN 'system.readiness'
    WHEN 'platform_events' THEN 'activity.event'
    ELSE NULL
  END;

  IF topic_name IS NULL THEN RETURN NEW; END IF;

  -- Realtime is an invalidation/status transport. Never mirror authoritative
  -- balances, reward amounts, prepared transactions, secrets, or receipt payloads.
  event_name := CASE WHEN TG_OP='INSERT' THEN 'created' ELSE 'updated' END;
  INSERT INTO realtime_events(topic,event_type,subject_id,entity_type,entity_id,payload)
  VALUES(
    topic_name,
    event_name,
    CASE WHEN TG_TABLE_NAME IN ('operational_snapshots','governance_proposals','reward_epochs','reward_vault_snapshots','bridge_reserve_snapshots') THEN NULL ELSE subject_value END,
    TG_TABLE_NAME,
    entity_value,
    jsonb_strip_nulls(jsonb_build_object('status',status_value,'operation',TG_OP))
  ) RETURNING event_id INTO emitted_id;
  PERFORM pg_notify('powerchain_realtime', emitted_id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'staking_intents','staking_positions','reward_claims','reward_epochs',
    'governance_intents','governance_proposals','service_bond_intents','service_bonds',
    'wallet_transfer_intents','swap_intents','cctp_intents','bridge_reserve_snapshots','reward_vault_snapshots','operational_snapshots','platform_events'
  ] LOOP
    IF to_regclass(t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'realtime_emit_'||t, t);
      EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION powerchain_realtime_emit()', 'realtime_emit_'||t, t);
    END IF;
  END LOOP;
END $$;

COMMIT;
