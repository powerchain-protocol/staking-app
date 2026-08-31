# PowerChain AI Evaluation & Reliability Gates — v1.0.0

PowerChain treats AI quality as a release property rather than a prompt-only concern. The runtime includes deterministic policy evaluations, provider health/circuit state, prompt fingerprints, grounding metrics and user feedback.

## Release model

```text
Prompt / policy change
→ new AI_PROMPT_VERSION
→ source + AI runtime audit
→ database migration
→ policy eval run
→ provider/readiness checks
→ staged deployment
→ monitor fallback, grounding and feedback
```

A prompt version is immutable. The first use records its SHA-256 fingerprint in `ai_prompt_versions`. Reusing the same version with different prompt text fails with `AI_PROMPT_VERSION_CONFLICT`; change `AI_PROMPT_VERSION` intentionally instead.

## Policy evaluations

Seeded cases cover:

- secret/private-key input rejection;
- state-change request rejection;
- deterministic staking/reward tool planning;
- bridge-reserve evidence planning.

Authorized operators can run the suite with:

```text
POST /api/v1/admin/ai/evals
GET  /api/v1/admin/ai/evals
```

`AI_EVAL_MIN_PASS_RATE` defines the policy threshold. `AI_EVAL_REQUIRED_FOR_READINESS=true` makes a recent passing evaluation summary part of deep AI readiness.

These are deterministic policy/evidence tests, not a claim that an LLM can be proven hallucination-free. Provider-specific semantic evaluation should be run in staging before model changes are promoted.

## Provider reliability

Provider calls are tracked in `ai_provider_health` with:

- consecutive failures;
- successes/failures;
- current/average latency;
- last error;
- circuit-open expiry.

`AI_PROVIDER_FAILURE_THRESHOLD` opens a provider circuit. `AI_PROVIDER_OPEN_SECONDS` controls the cool-down. `AI_PROVIDER_FALLBACKS` defines ordered fallbacks that must also appear in `AI_ALLOWED_PROVIDERS`.

LoRA requests are pinned to the selected local provider and do not cross-provider fail over because doing so would silently change the requested adapter semantics.

## Grounding metrics

RAG retrieval combines:

- trust tier;
- source quality score;
- PostgreSQL full-text rank;
- lexical query overlap;
- per-document diversity;
- source validity windows.

Instruction-like source lines are removed before material enters the model context. `AI_RAG_MIN_EVIDENCE_SCORE` rejects weak candidates.

Grounding reports record evidence score, citation coverage, unsupported claim count, abstention state, provider and failover count.

## Streaming policy

`POST /api/v1/ai/chat/stream` streams **verification stages**, not raw unverified model tokens:

```text
policy → grounding → tools → provider → verification → complete
```

The final answer is emitted only after sensitive-output screening and citation verification. This avoids briefly displaying unsupported/raw model text before safety filtering.

## Feedback and operational metrics

Authenticated users can rate an assistant message through `POST /api/v1/ai/feedback`.

Administrative observability is available at:

```text
GET /api/v1/admin/ai/overview
```

It reports 15-minute request/failure/latency/fallback/grounding metrics, 24-hour feedback, provider circuit state and eval health.

Conversation content is subject to `AI_CONVERSATION_RETENTION_DAYS`; feedback uses `AI_FEEDBACK_RETENTION_DAYS`. The application indexer applies the retention policy.
