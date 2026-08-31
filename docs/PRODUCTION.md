# PowerChain Staking v1.0.0 — Production Operations

PowerChain Staking uses a fail-closed execution model. Read-only status can remain available while transaction creation/preparation/submission is disabled.

## Canonical activation sequence

Do not set `EXECUTION_ENABLED=true` until this sequence succeeds.

1. Apply all SQL migrations with `npm run db:migrate`.
2. Run `npm run release:audit`, `npm run check:source`, `npm run typecheck`, and `npm run build` in a dependency-enabled CI runner.
3. Configure `APP_ORIGIN`, `DATABASE_URL`, `SESSION_SECRET`, `RECEIPT_SEAL_SECRET`, and a reconciliation worker secret (`INTERNAL_WORKER_SECRET` and/or `CRON_SECRET`).
4. Configure a dedicated `SOLANA_RPC_URL` or `HELIUS_API_KEY`.
5. Configure and independently verify `PWRC_MINT`, staking/governance/bonds/bridge program IDs, and PWRC vault/reserve token accounts.
6. Configure the deployed wPWRC Sui coin type in `WPWRC_COIN_TYPE` using `0xPACKAGE::module::TYPE` syntax.
7. Configure `SUI_GRPC_URL` explicitly for the target Sui network. Production does not silently fall back to a public Sui endpoint.
8. If embedded wallets are required, set `EMBEDDED_WALLETS_ENABLED=true` only after `EMBEDDED_WALLET_PROVIDER_URL`, `EMBEDDED_WALLET_PROVIDER_API_KEY`, and the production provider webhook secret are configured.
9. Configure the Helius webhook `authHeader` to exactly match the secret stored in `HELIUS_WEBHOOK_AUTH_TOKEN`.
10. Keep `EXECUTION_ENABLED=false` and start the reconciliation worker/cron. A completed run refreshes reward-vault, bridge-reserve, and readiness attestations.
11. Verify `GET /api/v1/system/health` returns HTTP 200 with `ok=true`.
12. Verify `GET /api/v1/system/readiness` returns HTTP 200 with `ok=true`.
13. Confirm the readiness payload contains successful `reward_vault` and `bridge_reserves` checks. `reward_vault.data.covered` and `bridge_reserves.data.covered` must both be `true`.
14. Set `EXECUTION_ENABLED=true` and restart/redeploy using the same execution configuration.
15. Verify readiness again immediately after activation and keep the worker running continuously.

The readiness fingerprint deliberately excludes `EXECUTION_ENABLED`, so a healthy prospective readiness snapshot generated immediately before enabling execution remains valid as long as the mint, programs, vaults, bridge, Sui, and policy configuration has not changed and the snapshot is still within its configured freshness window.

## Runtime state-change gate

`STATE_CHANGE_REQUIRE_READINESS=true` is the production default.

Every staking, governance, service-bond, PWRC-transfer, and reward-epoch mutation is rejected unless:

- `EXECUTION_ENABLED=true`;
- all execution prerequisites remain configured;
- the latest readiness snapshot is `HEALTHY` and no older than `READINESS_ATTESTATION_MAX_AGE_SECONDS`;
- the readiness snapshot was generated for the exact current execution configuration fingerprint;
- the configured reward-vault snapshot is covered and no older than `REWARD_COVERAGE_MAX_AGE_SECONDS`;
- the configured PWRC/wPWRC bridge snapshot is verified/covered and no older than `BRIDGE_COVERAGE_MAX_AGE_SECONDS`.

Typical fail-closed errors include:

```text
READINESS_ATTESTATION_REQUIRED
READINESS_ATTESTATION_STALE
READINESS_CONFIGURATION_CHANGED
REWARD_VAULT_ATTESTATION_REQUIRED
REWARD_VAULT_ATTESTATION_STALE
REWARD_VAULT_UNDERFUNDED
BRIDGE_RESERVE_ATTESTATION_REQUIRED
BRIDGE_RESERVE_ATTESTATION_STALE
BRIDGE_RESERVE_UNDERCOLLATERALIZED
```

Do not disable this gate in production merely to restore transaction throughput. Resolve the underlying readiness failure.

## wPWRC / Sui configuration

Required when `BRIDGE_REQUIRED_FOR_EXECUTION=true`:

```bash
SUI_NETWORK=mainnet
SUI_GRPC_URL=https://<your-sui-grpc-endpoint>
WPWRC_COIN_TYPE=0x<deployed-package>::<module>::<type>
WPWRC_DECIMALS=9
```

Use the actual deployed wPWRC coin type. Do not substitute the example shape above.

Bridge verification reads the Solana Token-2022 PWRC reserve account and the Sui wPWRC treasury supply, normalizes decimals, and enforces:

```text
wPWRC total supply <= verified PWRC bridge reserve
```

Bridge execution must remain disabled if the reserve authority, bridge program identity, token-account state, Sui treasury supply, or reserve coverage cannot be verified.

## Embedded wallet configuration

Embedded wallets are opt-in:

```bash
EMBEDDED_WALLETS_ENABLED=false
```

When enabled, configure:

```bash
EMBEDDED_WALLETS_ENABLED=true
EMBEDDED_WALLET_PROVIDER_URL=https://<provider-api>
EMBEDDED_WALLET_PROVIDER_API_KEY=<secret>
EMBEDDED_WALLET_PROVIDER_WEBHOOK_SECRET=<secret>
```

PowerChain stores wallet links and provider subjects, not user private keys. Signing sessions require explicit user presence through the provider. The public wallet UI hides embedded-wallet enrollment when the capability is disabled.

## Helius webhook

The Helius webhook endpoint is:

```text
POST /api/webhooks/helius
```

Configure the webhook authorization header to the exact value stored in:

```bash
HELIUS_WEBHOOK_AUTH_TOKEN=<high-entropy-secret>
```

Do not prepend `Bearer` unless the stored secret itself includes that prefix; the receiver performs an exact constant-time comparison against the complete `Authorization` header value. Webhook events are durable reconciliation hints only. Finalized Solana RPC state remains authoritative.

## Worker

Run reconciliation continuously using one of the supported modes.

One-shot external scheduler:

```bash
npm run worker:reconcile
```

Long-running process/supervisor:

```bash
npm run worker:reconcile:loop
```

Vercel deployments include `vercel.json` with a one-minute `/api/cron/reconcile` schedule protected by `CRON_SECRET`.

Each successful worker endpoint invocation:

1. indexes reward epochs;
2. processes durable Helius hints;
3. reconciles submitted/confirming intents from finalized RPC state;
4. refreshes reward-vault coverage;
5. refreshes PWRC/wPWRC bridge reserve coverage;
6. records the completed reconciliation run;
7. performs deep readiness and stores the current readiness attestation.

Readiness fails if the latest completed worker run exceeds `RECONCILIATION_STALE_SECONDS`.

## Accounting invariants

- Staked principal is separate from reward funds.
- Ecosystem rewards are separate from staking rewards.
- Reward epochs cannot collectively commit more than the verified reward-vault balance.
- State-changing APIs cannot proceed on stale or uncovered reward-vault accounting.
- Every financial business mutation posts one idempotent double-entry journal.
- Every completed action produces one immutable hash-chained receipt.
- Transaction submission is never treated as reconciliation or settlement.

## Sessions

Wallet authentication uses single-use challenges. Authenticated sessions are signed HttpOnly cookies backed by server-side `auth_sessions` records. Logout revokes the session record in addition to clearing the cookie.

## PWRC transfers

PWRC send operations are server-quoted Token-2022 transfer intents. The server validates the canonical mint, derives source/destination token accounts, calculates the active transfer fee, creates the recipient ATA idempotently when necessary, hashes the prepared message, and rejects changed or stale signed transactions. Finalized transfers are reconciled into the double-entry ledger and immutable receipt chain.

## Health vs readiness

`GET /api/v1/system/health` checks current runtime health and configuration.

`GET /api/v1/system/readiness` is the execution-readiness contract. It prospectively validates all execution prerequisites even while `EXECUTION_ENABLED=false`, including:

- database/migrations;
- dedicated runtime configuration;
- Solana RPC;
- PWRC Token-2022 identity/policy;
- deployed PowerChain programs;
- embedded-wallet configuration when enabled;
- Helius webhook authorization configuration when required;
- receipt-chain integrity;
- reconciliation exception budget;
- reconciliation worker freshness;
- reward-vault solvency;
- PWRC/wPWRC bridge reserve coverage.

A deep readiness result is persisted as a non-secret operational attestation containing the execution configuration fingerprint used by the runtime state-change gate.

## Runtime emergency controls

PowerChain now has a database-backed control plane in addition to `EXECUTION_ENABLED`. Use the runtime control API to pause a single domain or all state changes without rebuilding the deployment. Production activation should verify that every runtime control is enabled before enabling execution.

Recommended production defaults:

```dotenv
AUTO_PAUSE_ON_RECONCILIATION_EXCEPTIONS=true
WEBHOOK_MAX_PROCESSING_ATTEMPTS=8
WEBHOOK_RETRY_BASE_SECONDS=15
```

If reconciliation exceptions breach policy, the worker can trip `GLOBAL=false`. Treat automatic pauses as incidents: diagnose, reconcile, run deep readiness, then explicitly restore execution.

Helius webhook processing is durable and bounded. Failed events back off exponentially and become dead-letter events after the configured retry budget. Any unresolved dead-letter event makes deep readiness unhealthy.

## Observability release gate

Migration `006_observability_and_recovery.sql` is required by health/readiness before this source revision is considered deployable.

Before enabling execution, verify that request tracing headers are visible through the ingress/load balancer and are not stripped:

- `x-request-id`
- `x-trace-id`
- `server-timing`

After authentication, perform a non-destructive state-changing test in the deployment environment and confirm the corresponding `mutation_audit_events` row includes the PowerChain subject and wallet address.

Use `/api/v1/admin/operations` as the operator summary and keep `/api/v1/system/readiness` as the authoritative execution-readiness endpoint.

## Identity and AI activation

Before exposing authenticated production routes:

1. keep `EXECUTION_ENABLED=false`;
2. configure Clerk publishable/server verification keys and `CLERK_WEBHOOK_SIGNING_SECRET`, or intentionally select and configure Better Auth;
3. configure social providers only in the selected provider and keep OAuth client secrets server-side;
4. apply `010_identity_ai_confirmations.sql`;
5. set `REQUIRE_PRIMARY_IDENTITY=true` and `ACTION_CONFIRMATION_REQUIRED=true`;
6. verify Clerk lifecycle webhooks are Svix-signed and accepted;
7. if mail is enabled, configure `MAIL_FROM` and `RESEND_API_KEY` in the secret store;
8. leave `AI_ENABLED=false` until the HMAC-verified AI gateway is deployed;
9. when AI is enabled, keep `AI_ALLOW_STATE_CHANGES=false` unless a separately reviewed policy explicitly requires otherwise;
10. call `/api/v1/system/readiness` and confirm both `identity_security` and `ai_security` are healthy in addition to the existing chain/reward/bridge checks.

Account social login is never a replacement for wallet verification or transaction approval.

## AI runtime v3 production gates

For AI-enabled production deployments, configure and review:

```text
AI_PROVIDER_FALLBACKS=
AI_PROVIDER_FAILURE_THRESHOLD=3
AI_PROVIDER_OPEN_SECONDS=60
AI_RAG_CANDIDATE_LIMIT=24
AI_RAG_MIN_EVIDENCE_SCORE=0.30
AI_MAX_TOOL_CALLS=8
AI_EVAL_MIN_PASS_RATE=0.95
AI_EVAL_REQUIRED_FOR_READINESS=true
AI_PROMPT_VERSION=powerchain-ai-runtime-v3
AI_CONVERSATION_RETENTION_DAYS=90
AI_FEEDBACK_RETENTION_DAYS=365
```

Before promoting a prompt/model/provider change, assign a new prompt version when prompt text changes, apply migration `012_ai_reliability_evals.sql`, run `POST /api/v1/admin/ai/evals`, and inspect `GET /api/v1/admin/ai/overview`. When `AI_EVAL_REQUIRED_FOR_READINESS=true`, deep readiness fails if no recent policy eval exists or the configured pass-rate threshold is not met.

Do not enable a fallback provider merely because credentials are available. Every fallback must be intentionally included in `AI_ALLOWED_PROVIDERS` and reviewed for data residency, retention, model capability and contractual requirements.

## Realtime deployment

When `REALTIME_ENABLED=true`, deploy `apps/backend/realtime/start.ts` as a long-running service separate from the serverless/Next.js API process. Production requirements:

```text
REALTIME_PUBLIC_URL=wss://<dedicated-host>
REALTIME_SIGNING_SECRET=<32+ character secret>
REALTIME_HEARTBEAT_SECONDS=25
REALTIME_MAX_SUBSCRIPTIONS=16
REALTIME_MAX_CONNECTIONS_PER_SUBJECT=4
REALTIME_MAX_MESSAGES_PER_MINUTE=120
REALTIME_MAX_PAYLOAD_BYTES=65536
REALTIME_EVENT_RETENTION_HOURS=24
```

Apply migration `013_realtime_transport.sql`, start the process, run `npm run realtime:check`, and verify both `/api/v1/realtime/status` and the `realtime_transport` entry in `/api/v1/system/readiness` before enabling execution. The WebSocket service is an invalidation channel only; accounting and transaction state remain authoritative through PostgreSQL, reconciliation and REST reads. See [Realtime](REALTIME.md).
