BEGIN;

CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL,
  assistant_id text NOT NULL DEFAULT 'powerchain',
  title text,
  response_style text NOT NULL DEFAULT 'professional',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_conversations_subject_idx ON ai_conversations(subject_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  subject_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('USER','ASSISTANT','TOOL','SYSTEM')),
  content text NOT NULL,
  provider text,
  model text,
  certainty text CHECK (certainty IN ('VERIFIED','GROUNDED','INFERENCE','UNAVAILABLE')),
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_runs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx ON ai_messages(conversation_id,created_at);

CREATE TABLE IF NOT EXISTS ai_rag_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  title text NOT NULL,
  source_type text NOT NULL,
  source_uri text,
  domain text NOT NULL,
  trust_tier text NOT NULL CHECK (trust_tier IN ('AUTHORITATIVE','VERIFIED','REFERENCE','UNTRUSTED')),
  content_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_rag_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES ai_rag_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  content_hash text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content,''))) STORED,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id,chunk_index)
);
CREATE INDEX IF NOT EXISTS ai_rag_chunks_search_idx ON ai_rag_chunks USING gin(search_vector);

CREATE TABLE IF NOT EXISTS ai_tool_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES ai_requests(id) ON DELETE SET NULL,
  subject_id text NOT NULL,
  tool_name text NOT NULL,
  tool_mode text NOT NULL CHECK (tool_mode IN ('READ','PROPOSE','STATE_CHANGE')),
  input_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('STARTED','COMPLETED','REJECTED','FAILED')),
  output_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS ai_tool_runs_subject_idx ON ai_tool_runs(subject_id,started_at DESC);

CREATE TABLE IF NOT EXISTS ai_grounding_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES ai_requests(id) ON DELETE CASCADE,
  subject_id text NOT NULL,
  evidence_count integer NOT NULL DEFAULT 0,
  required_citations integer NOT NULL DEFAULT 0,
  supported_claims integer NOT NULL DEFAULT 0,
  unsupported_claims integer NOT NULL DEFAULT 0,
  abstained boolean NOT NULL DEFAULT false,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
