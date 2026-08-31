# AI & Compute Security — v1.0.0

PowerChain AI is a **policy-gated compute client**, not an execution authority.

## Default policy

```text
AI_ENABLED=false
AI_ALLOW_STATE_CHANGES=false
```

When enabled, a request must pass:

1. authenticated PowerChain account;
2. runtime `AI` control;
3. model allowlist;
4. tool allowlist;
5. request-size limit;
6. per-account rate limit;
7. secret/private-key input screening;
8. financial/state-change policy;
9. signed gateway request boundary.

The default tool allowlist is read-only: portfolio, staking, rewards, governance and network reads. AI cannot sign a wallet challenge, sign a blockchain transaction, consume a privileged action confirmation, or bypass runtime/readiness controls.

## Gateway boundary

The backend calls only `AI_GATEWAY_URL`. Requests carry a PowerChain request ID and HMAC signature using `AI_GATEWAY_SIGNING_SECRET`. `AI_GATEWAY_API_KEY` remains server-only. The gateway call has a strict timeout and no browser access to provider credentials.

## Sensitive input

The AI policy blocks likely private keys, seed/mnemonic material and common secret-token patterns. Users should still never submit seed phrases, private keys, wallet recovery material or infrastructure credentials to AI.

## Financial state changes

`AI_ALLOW_STATE_CHANGES=false` is the supported production default. Even if a future deployment explicitly enables an AI-assisted mutation tool, the AI response remains advisory: the normal authoritative intent, exact transaction preparation, wallet approval, finality, reconciliation and ledger flow still applies. AI must never become a signing principal.

## Auditing

Accepted/rejected/completed AI requests are persisted as security-aware request records and platform events. Deep readiness reports whether AI is enabled, whether gateway request signing is configured, and whether state changes are allowed.

## Evidence-first runtime v2

The AI runtime does not promise zero hallucinations. Instead, it enforces operationally testable controls: trusted retrieval, deterministic read-tool planning, per-factual-sentence evidence markers, citation allowlisting, unsupported-claim removal and abstention when required evidence is unavailable.

Provider routing is restricted by `AI_ALLOWED_PROVIDERS`. LoRA adapters are restricted by `AI_LORA_ADAPTERS` and are accepted only by the local provider boundary. MCP calls are read-only and signed. MPC/key-share/signing operations are always denied to AI.

## AI runtime v2 enforcement

AI state changes remain blocked unconditionally in the v1.0.0 runtime even if the legacy `AI_ALLOW_STATE_CHANGES` variable is present. The variable is retained for compatibility but does not grant signing, submission or protocol mutation authority.

Direct providers do not require `AI_GATEWAY_URL`; each selected provider must satisfy its own configuration and allowlist checks. Conversation history is byte-bounded, provider/MCP responses are size-bounded before parsing, and failed read tools never become evidence.

## AI runtime v3 reliability controls

The runtime adds persistent provider circuit breakers and allowlisted failover, immutable prompt-version fingerprints, bounded tool contracts, source-quality RAG reranking, prompt-injection line filtering, verified-progress SSE, deterministic policy evals and feedback/grounding telemetry.

Raw model tokens are not streamed to the browser. This is intentional: PowerChain releases only the post-DLP, post-citation-verification answer. Provider failover never grants more authority than the selected provider, and LoRA requests do not fall back to a provider that cannot preserve the requested adapter semantics.

Conversation content and feedback have configurable retention windows and are pruned by the application indexer. AI request/audit records remain separate from user-visible conversation memory.
