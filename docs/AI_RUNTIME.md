# PowerChain AI Runtime v1.0.0

PowerChain Copilot is an evidence-first analysis and operating-assistance layer. It is not a signer, custodian, accounting authority, oracle, or transaction executor.

## Runtime pipeline

```text
Authenticated account
→ AI policy gate
→ deterministic assistant + tool planning
→ trusted RAG retrieval
→ read-only PowerChain / MCP tools
→ provider router
→ structured answer + output DLP
→ factual-sentence citation verification
→ unsupported-claim removal / abstention
→ conversation + grounding audit
```

## Provider routing

Supported provider boundaries are `gateway`, `openai`, `anthropic`, `deepseek`, `local`, `ollama`, and `vllm`. Only providers listed in `AI_ALLOWED_PROVIDERS` may be selected. API credentials remain server-side.

Local inference can use explicitly allowlisted LoRA adapters through `AI_LORA_ADAPTERS`. A client cannot provide a filesystem path or arbitrary adapter identifier.

## RAG

`ai_rag_documents` stores source identity, trust tier, domain, content hash, validity window and metadata. `ai_rag_chunks` uses PostgreSQL full-text indexing. Repository knowledge can be loaded with:

```bash
npm run db:migrate
npm run ai:ingest
```

Trust tiers are `AUTHORITATIVE`, `VERIFIED`, `REFERENCE`, and `UNTRUSTED`. Disabled or expired documents are excluded.

## Hallucination controls

No LLM can provide a mathematical guarantee of zero hallucinations. PowerChain therefore uses fail-safe output controls instead:

- current balances, chain state, rewards, proposals and network claims must come from retrieved evidence or verified read tools;
- factual operational sentences must contain a valid citation marker;
- citation IDs not present in the evidence set are rejected;
- unsupported factual sentences are removed;
- when required evidence is absent, the assistant abstains;
- retrieved content and MCP output are data, never instructions;
- AI never treats a submitted transaction as finalized or reconciled.

## MCP and MPC

MCP is an allowlisted read-only tool boundary. Server-to-server MCP gateway calls are HMAC signed and timeout bounded.

MPC/threshold-signing infrastructure is a separate security domain. AI cannot access key shares, start signing rounds, approve quorum, produce signatures or submit MPC-authorized transactions.

## Agents and skills

Agent domains:

- generic
- Solana
- Sui
- PowerChain
- renewables
- charts
- data
- support

Canonical character, skill, assistant and agent policies are under `/skills`.

## UI

`/copilot` exposes assistant, response style, provider/model and read-only tool controls. It displays evidence, certainty, provider/model metadata and explicit read-only authority. Wallet signing and protocol execution continue through normal application flows.

## Conversation memory

Conversation history is account-scoped, persisted in PostgreSQL, capped by both message count and `AI_MAX_HISTORY_BYTES`, and passed only to the selected allowlisted provider. PowerChain does not persist or expose hidden model chain-of-thought; persisted records contain user-visible messages, citations, tool-run summaries and grounding reports.

## Failure isolation

Read tools are fail-soft. A failed RPC, bridge, portfolio, reward or MCP read is recorded as unavailable and receives no evidence citation. Other healthy evidence sources may still support an answer. If the remaining evidence is insufficient for a required factual claim, the verifier removes that claim or returns an explicit abstention.

Provider response bodies are bounded while streaming before parsing. Provider and MCP endpoints must return JSON, timeout policies are enforced, and sensitive-output DLP runs before any generated answer is stored or displayed.

## Reliability upgrade — runtime v3

The v1.0.0 product now uses the `ai-runtime-v3` policy layer while the product version remains 1.0.0.

### Provider failover and circuit breaking

Provider health is persistent rather than inferred from the last browser request. Consecutive retryable provider failures open a bounded circuit and the router can move to an explicitly allowlisted fallback. The resolved provider and fallback count are recorded on each AI request. LoRA requests remain pinned to the selected local provider.

### Prompt governance

The system prompt has a named version and SHA-256 fingerprint. A version cannot silently change contents after registration; a different prompt requires a new `AI_PROMPT_VERSION`.

### Grounding quality

RAG now reranks full-text candidates using source trust, source quality, search rank and lexical overlap, then enforces per-document diversity. Low-scoring evidence is excluded. Source lines that resemble prompt-injection instructions are removed before model context construction.

### Tool contracts

Every approved AI tool has an input validator, data classification and maximum result size. A tool without a registered contract cannot execute. Tool results remain read-only evidence; they do not grant transaction authority.

### Verified-progress streaming

The Copilot UI uses an SSE progress endpoint. It streams runtime stages but deliberately does **not** stream raw provider tokens. User-visible assistant text is released only after DLP and grounding verification have completed.

### Evaluation and feedback

Policy eval cases, eval runs, provider health and end-user message feedback are persisted for release/operations review. See [AI evaluation and reliability gates](AI_EVALS.md).
