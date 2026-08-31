# Changelog

## 2026-08-31 — Realtime transport, typed API contracts & live-query services

- Added dedicated authenticated `powerchain.realtime.v1` WebSocket service with PostgreSQL `LISTEN/NOTIFY`, heartbeat/readiness endpoints and graceful shutdown.
- Added one-use HMAC-signed realtime access tokens bound to the authenticated PowerChain subject and atomically consumed during handshake.
- Added migration `013_realtime_transport.sql` with minimal invalidation events, monotonic cursors, server heartbeat persistence and bounded retention.
- Added per-subject connection limits, message-rate limits, subscription limits, payload ceilings, production origin validation and `wss://` enforcement.
- Added `/api/v1/realtime/status`, `/api/v1/realtime/token`, `/api/v1/realtime/events` and `/api/v1/endpoints`.
- Expanded shared contracts with typed endpoint, action, intent and realtime event schemas.
- Added a shared API client with timeout/retry/idempotency behavior and an authenticated reconnecting realtime client.
- Added dashboard realtime manager, live-query hooks and domain hooks for staking, rewards, governance, wallet balances, system status and intent confirmation.
- Reworked transaction confirmation to use socket invalidation plus authoritative intent GETs, retaining fallback polling for correctness.
- Added service/action facades across backend and dashboard to remove duplicated request/intent lifecycle logic.
- Added `realtime_transport` to deep readiness and a dedicated realtime release audit.
- Kept WebSockets non-authoritative: balances, positions, rewards, governance weight, bridge coverage, receipts and settlement remain REST/database/reconciliation state.


## 2026-08-31 — AI reliability, evals, provider failover & verified streaming

- Added persistent AI provider health, latency tracking, circuit breaking and ordered allowlisted failover.
- Added immutable AI prompt version fingerprints; a prompt version cannot silently change contents.
- Added hybrid RAG reranking using trust tier, document quality, PostgreSQL full-text rank and lexical overlap with per-document diversity.
- Added source prompt-injection line filtering before RAG content enters model context.
- Added explicit AI tool contracts with argument validation, data class and result-size ceilings.
- Added deterministic AI policy eval cases/runs, configurable pass-rate gate and administrative eval endpoints.
- Added 15-minute AI operations metrics covering failures, p95 latency, fallback use, evidence/citation coverage and provider state.
- Added authenticated answer feedback and retention policies for Copilot conversations/feedback.
- Added verified-progress SSE: policy/grounding/tool/provider/verification stages stream to the UI, while raw unverified provider tokens remain hidden until final verification.
- Added Copilot provider-health, failover, prompt-version, eval and evidence-quality status in the UI.
- Added migration `012_ai_reliability_evals.sql` and dedicated AI evaluation/reliability documentation.

## 2026-08-31 — Identity, signatures, social login & secured AI hardening

- Added Clerk as the default primary account identity layer with server JWT verification and Svix-verified user lifecycle webhooks.
- Added selectable Better Auth account/session boundary with dedicated PostgreSQL tables, email verification and configured Google/GitHub/Apple social providers.
- Bound wallet authentication challenges and wallet sessions to the signed-in account subject.
- Added one-time, wallet-signed exact-action confirmations for privileged off-chain mutations.
- Added secured AI/compute gateway with account auth, runtime controls, model/tool allowlists, rate limits, sensitive-input screening, HMAC request signing and state changes disabled by default.
- Added mail/template service, platform event journal, trusted-token CSV policy registry and `/api/v1/` discovery root.
- Added legal surfaces, reusable error boundary, App Router error/not-found surfaces, Pages 404 compatibility pages, toast/event bus, form primitives, messages/information components, redirects and PowerChain API clients.
- Added identity/AI deep-readiness checks and migration `010_identity_ai_confirmations.sql`.
- Added auth/AI security and UI integrity release audits; placeholder links and inert buttons are rejected by the release gate.
- Added per-app READMEs plus dedicated authentication and AI security documentation.

## 2026-08-31 — Reference UI/UX + monorepo architecture

- Split the product into `apps/web`, `apps/dashboard`, and `apps/backend`.
- Dashboard proxies authenticated `/api/*` calls to the dedicated backend.
- Rebuilt the desktop shell against the supplied 1536×1024 references: compact header, operational sidebar, right-side rails, dark-green footer and reference-locked card geometry.
- Added shared PowerChain UI, contracts and API-client workspaces.
- Added the Learn surface and public web experience.
- Preserved wallet auth, embedded-wallet integration, Token-2022 validation, staking intents, Solana/Helius, rewards, governance, bonds, reconciliation, ledger, receipts and PWRC/wPWRC reserve verification in the backend.
- Added monorepo release audit and CI build/typecheck gates.

# PowerChain Staking — Canonical v1.0.0 Upgrade Log

The canonical product version remains **1.0.0**. These are production-hardening changes to the v1.0.0 baseline, not a v1.1 release.

## Current upgrade

- Fixed reward-vault accrued-liability accounting after settled claims.
- Added real PWRC Token-2022 wallet transfer intents.
- Added transfer-fee calculation and net-receipt disclosure.
- Added transfer-hook-aware Token-2022 transaction construction.
- Added idempotent recipient associated-token-account creation.
- Added exact prepared-message signing/integrity enforcement for transfers.
- Added transfer reconciliation, double-entry accounting and immutable transfer receipts.
- Replaced representative PWRC wallet data with authenticated live balances, staking principal and claimable rewards.
- Replaced decorative receive QR with a QR generated from the authenticated wallet address.
- Added durable wallet-transfer history.
- Added one-minute authenticated reconciliation cron plus long-running worker mode.
- Added worker freshness, schema migration, receipt chain and reconciliation exception readiness gates.
- Added readiness snapshots with bounded retention.
- Added reward-pool validation and same-pool epoch overlap prevention.
- Added dynamic runtime state in the application footer.
- Added embedded-wallet transaction completion/reconciliation feedback.
- Added canonical API documentation.
- Added dependency-free release audit covering canonical version, required migrations/routes/workers, pinned runtime dependencies, readiness coverage and representative-data leakage checks.
- Added release audit to CI before dependency installation/typecheck/build.

## Existing v1.0.0 hardening retained

- Wallet nonce authentication and revocable sessions.
- Non-custodial embedded-wallet provider boundary.
- Token-2022 mint/authority/extension validation.
- Staking intents and position lifecycle.
- Funded reward epochs and cumulative reward indexes.
- Governance voting/execution intents.
- Operator/verifier service bonds.
- Reconciliation leases and durable transaction observations.
- Idempotent double-entry ledger.
- Hash-chained immutable receipts.
- PWRC/wPWRC bridge reserve verification.

## 1.0.0 — deployment safety gate hardening

- Added explicit `SUI_GRPC_URL` and `WPWRC_COIN_TYPE` validation for PWRC/wPWRC reserve verification.
- Removed the silent Sui gRPC production fallback; bridge readiness now fails closed when the endpoint is absent.
- Added `EMBEDDED_WALLETS_ENABLED`; embedded enrollment is hidden/rejected until provider credentials are configured.
- Added exact constant-time Helius webhook authorization-header verification.
- Added prospective execution readiness while `EXECUTION_ENABLED=false`.
- Added non-secret execution-configuration fingerprints to readiness attestations.
- Added fresh readiness, reward-vault, and bridge-reserve attestation requirements for state-changing APIs.
- Reconciliation workers now refresh reward-vault coverage, bridge coverage, and deep readiness after every completed run.
- Added public system capabilities for wallet/network UI gating.

## v1.0.0 — Operational Resilience Upgrade

Canonical version remains **1.0.0**.

- Added database-backed runtime execution controls and emergency pause capability.
- Added admin control/alert APIs gated by authorized wallets.
- Added automatic global circuit breaker for reconciliation exception breaches.
- Added bounded Helius webhook retry, exponential backoff and dead-lettering.
- Added operational alerts and security-event records.
- Added mutation API audit records.
- Added reconciliation exception resolution workflow.
- Deep readiness now includes runtime controls, webhook dead letters and critical alerts.
- Added migration `005_operational_resilience.sql` and operations runbook.

## v1.0.0 — Observability & Recovery Hardening

- Added request-scoped `x-request-id` and W3C-compatible trace correlation.
- Added structured JSON API completion/failure logs and `server-timing` latency headers.
- Mutation audit rows now capture authenticated PowerChain subject and wallet address.
- Replaced JSON body parsing with a true streamed 1 MiB ceiling plus nesting/prototype-key safeguards.
- Added Solana/Sui wallet-address validation and per-wallet authentication throttles.
- Separated lightweight service health from deep execution readiness.
- Fixed readiness so dead-lettered webhooks and critical operational alerts are actually enforced.
- Added administrative operational overview and reconciliation exception listing/requeue APIs.
- Fixed the reconciliation circuit breaker to evaluate all unresolved exceptions across runs.
- Included webhook-driven reconciliations in worker processed/exception statistics.
- Parameterized stale reconciliation claims from the configured lease policy instead of a hard-coded five-minute window.
- Added bounded validation for execution-sensitive integer configuration values and production `APP_ORIGIN` validation.
- Added HSTS/COOP/CORP/origin isolation security headers and improved degraded/offline/loading/error UX.
- Added migration `006_observability_and_recovery.sql` and observability runbook documentation.

## /programs protocol workspace upgrade

- Added canonical root `/programs/` workspace for Solana staking, governance, operator/verifier bonds, bridge reserve and Sui wPWRC.
- Added PDA/topology derivation endpoint and made program verification require all four deployed Solana programs plus initialized account ownership.
- Fixed staking position seeds to SHA-256 32-byte intent seeds.
- Added on-chain voter-weight records, separate reward vault, service-role/service-type bond identity and bridge replay protection.
- Made Token-2022 transfer-fee accounting net-aware for staking, compounding, bonds and bridge reserves.
- Added fail-closed TransferHook protocol validation for v1.0.0 and a deployment evidence guide.

## 2026-08-31 — Evidence-first AI runtime, RAG, MCP/MPC boundary and Copilot UX

- Replaced the single AI gateway wrapper with a provider router supporting signed gateway, OpenAI-compatible, Anthropic, DeepSeek and local Ollama/vLLM-style inference boundaries.
- Added allowlisted local LoRA adapter selection; arbitrary adapter paths are rejected.
- Added deterministic assistant and read-tool planning for portfolio, staking, rewards, governance, network, bridge, Solana RPC and Token-2022 state.
- Added PostgreSQL RAG documents/chunks with source hashes, trust tiers, validity windows and full-text retrieval.
- Added repository knowledge ingestion command and migration `011_ai_runtime.sql`.
- Added factual-sentence citation verification, unsupported-claim removal and fail-closed abstention when evidence is missing.
- Added read-only MCP gateway policy with signed server requests and explicit rejection of state-changing AI tools.
- Added a separate MPC policy that blocks AI from key shares, signing rounds, threshold approvals and transaction signatures.
- Added canonical PowerChain assistants, skills, characters and agent-domain documentation.
- Added `/copilot` with assistant/style/provider/model/LoRA controls, read-only tools, evidence cards, certainty indicators and safe failure states.
- Added dedicated AI runtime release audit and deep-readiness reporting for provider, RAG, MCP and MPC policy state.
- Added byte-bounded conversation history across providers without storing hidden chain-of-thought.
- Added fail-soft read-tool execution: unavailable live sources are audited and excluded from evidence instead of collapsing unrelated grounded analysis.
- Added provider response stream ceilings, JSON content-type enforcement, output DLP and direct-provider independence from `AI_GATEWAY_URL`.
- Added professional Copilot response rendering, source links, copy action, read-tool availability state and unsupported-claim omission indicators.


## 2026-08-31 — Canonical monochrome + operational-green UI system

- Rebased `apps/web` and `apps/dashboard` onto the canonical white / black / neutral PowerChain visual system.
- Black `#0a0a0a` is now the default filled primary action; dark green `#0b6b38` is limited to operational/verified PowerChain meaning.
- Reserved `#e7000b` exclusively for destructive/failure states.
- Normalized all interactive geometry to 18px and all cards/panels/modals to 24px.
- Removed rendered gradients, glass/blur treatments, chromatic decorative fills and colored shadows.
- Normalized meaningful UI text to a 14px minimum and clamped tracking to ±0.05em.
- Applied the canonical 48px/600/-0.05em display headline treatment with Geist-first font stacks.
- Added the required 1px card hairline and stacked near-flat card shadow.
- Converted the shared PowerChain logo to a black primary mark with a restrained operational-green core.
- Reworked renewable illustration assets to solid neutral/operational colors without SVG gradients.
- Removed the non-functional dashboard theme selector; the v1.0.0 UI is explicitly canonical-light until a separately validated theme system exists.
- Added shared `packages/ui/src/tokens.ts`, `docs/DESIGN_SYSTEM.md`, and a release-gated `design:audit`.
