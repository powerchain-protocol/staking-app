# PowerChain Staking v1.0.0 — API Surface

Canonical base: `/api/v1`

All user-specific mutation APIs require an authenticated wallet session. Browser mutations are origin checked and financial create endpoints use idempotency keys.

## Authentication

```text
POST /api/v1/auth/wallet/challenge
POST /api/v1/auth/wallet/verify
GET  /api/v1/auth/session
POST /api/v1/auth/logout
```

## Embedded wallet

```text
POST /api/v1/wallets/embedded/enroll
POST /api/v1/wallets/embedded/complete
POST /api/v1/wallets/embedded/session
POST /api/v1/wallets/embedded/sign/complete
```

The application does not store user private keys. The embedded-wallet provider is an external signing boundary.

## Wallet / PWRC

```text
GET  /api/v1/wallets/balances
GET  /api/v1/wallets/transfers
POST /api/v1/wallets/transfers
GET  /api/v1/wallets/transfers/:id
POST /api/v1/wallets/transfers/:id/prepare
POST /api/v1/wallets/transfers/:id/submit
```

A PWRC transfer uses the same lifecycle as staking:

```text
QUOTED → AWAITING_SIGNATURE → SUBMITTED → CONFIRMING → RECONCILED
```

The server derives the Token-2022 source/destination accounts, current transfer fee, recipient net amount, optional destination ATA creation and prepared message hash. The wallet signs the exact prepared transaction.

## Token / RPC

```text
GET /api/v1/token/pwrc/validate
GET /api/v1/rpc/health
GET /api/v1/programs/verify
```

## Staking

```text
POST /api/v1/staking/intents
GET  /api/v1/staking/intents/:id
POST /api/v1/staking/intents/:id/prepare
POST /api/v1/staking/intents/:id/submit
GET  /api/v1/staking/positions
```

Supported staking actions:

```text
STAKE
INCREASE
REQUEST_UNSTAKE
CANCEL_UNSTAKE
WITHDRAW
CLAIM
COMPOUND
```

## Rewards

```text
GET  /api/v1/rewards/overview
GET  /api/v1/rewards/coverage
GET  /api/v1/rewards/epochs
POST /api/v1/rewards/epochs
```

Reward epochs are funded, pool-specific and non-overlapping. Claims preserve epoch-level allocation.

## Governance

```text
GET  /api/v1/governance/overview
GET  /api/v1/governance/proposals
POST /api/v1/governance/intents
GET  /api/v1/governance/intents/:id
POST /api/v1/governance/intents/:id/prepare
POST /api/v1/governance/intents/:id/submit
```

## Operator / verifier bonds

```text
GET  /api/v1/bonds
POST /api/v1/bonds/intents
GET  /api/v1/bonds/intents/:id
POST /api/v1/bonds/intents/:id/prepare
POST /api/v1/bonds/intents/:id/submit
```

## Bridge assurance

```text
GET /api/v1/bridge/reserves
```

Hard invariant:

```text
wPWRC total supply <= verified PWRC bridge reserve
```

## Ledger / receipts

```text
GET /api/v1/ledger
GET /api/v1/receipts
GET /api/v1/receipts/:id
GET /api/v1/receipts/verify
```

Ledger journals are idempotent double-entry records. Receipts are immutable, hash chained and optionally HMAC sealed.

## Operations

```text
GET  /api/v1/system/health
GET  /api/v1/system/readiness
GET  /api/v1/system/capabilities
POST /api/internal/reconcile
GET  /api/cron/reconcile
POST /api/webhooks/helius
```

The internal worker endpoint uses `INTERNAL_WORKER_SECRET`; the scheduler endpoint uses `CRON_SECRET`. Helius webhook data is a durable reconciliation hint, not finality authority. The webhook receiver requires an `Authorization` header exactly matching `HELIUS_WEBHOOK_AUTH_TOKEN`.

`/api/v1/system/readiness` performs prospective execution checks even while `EXECUTION_ENABLED=false`. Successful deep readiness is persisted with a non-secret execution-configuration fingerprint. When state-change gating is enabled, mutation APIs require that readiness attestation plus fresh covered reward-vault and bridge-reserve attestations.

`/api/v1/system/capabilities` exposes only non-secret UI capabilities such as whether embedded wallets and Sui are configured.

## Operational control plane

### GET /api/v1/admin/controls
Requires an authenticated wallet present in a configured administrative allowlist. Returns runtime controls for `GLOBAL`, `STAKING`, `GOVERNANCE`, `BONDS`, `TRANSFERS`, `REWARDS`, and `BRIDGE`.

### POST /api/v1/admin/controls
Changes a runtime control without redeploying the application.

```json
{
  "key": "STAKING",
  "enabled": false,
  "reason": "Investigating reconciliation exception",
  "expiresAt": "2026-08-30T18:00:00Z"
}
```

An active disabled control causes affected mutation APIs to return `503 EXECUTION_PAUSED`.

### GET /api/v1/admin/alerts
Returns operational alerts to an authenticated administrative wallet.

### POST /api/v1/admin/reconciliation/exceptions/:id/resolve
Marks an investigated reconciliation exception resolved and preserves an administrative resolution note/security event.

## Operational observability and recovery

### `GET /api/v1/admin/operations`
Requires an authorized administrative wallet. Returns reconciliation freshness, unresolved exception counts, webhook backlog/dead letters, active alerts, latest readiness attestation, 15-minute mutation latency/error statistics and runtime controls.

### `GET /api/v1/admin/reconciliation/exceptions`
Lists up to 250 unresolved reconciliation exceptions in oldest-first order, including retry metadata.

### `POST /api/v1/admin/reconciliation/exceptions/:id/requeue`
Safely requeues a reviewable submitted staking, governance, bond or PWRC transfer intent. Finalized failed transactions and non-intent readiness/solvency exceptions cannot be requeued.

### Request correlation
All shared API routes return `x-request-id`, `x-trace-id` and `server-timing`. Authenticated state-changing audit rows retain the request ID, PowerChain subject and wallet address.

### Payload limits
JSON bodies are streamed and rejected above 1 MiB even when `Content-Length` is absent or incorrect. JSON nesting deeper than 40 levels and prototype-sensitive keys (`__proto__`, `prototype`, `constructor`) are rejected.

## Programs

- `GET /api/v1/programs/topology` — derive the expected staking/governance/bonds/bridge PDAs and Token-2022 vault addresses from configured program IDs + PWRC mint.
- `GET /api/v1/programs/verify` — require and verify all four deployed Solana programs plus initialized account/vault topology.

The topology endpoint does not prove deployment. The verify endpoint and deep readiness are the execution gates.


## Realtime transport

Realtime is an authenticated **invalidation/status channel**, not an authoritative financial-state API. Clients refresh the corresponding authenticated REST resource after receiving an event.

### `GET /api/v1/realtime/status`

Returns protocol, topic, heartbeat, limits and current server-heartbeat information. `authoritativeState` is always `false`.

### `POST /api/v1/realtime/token`

Requires platform identity. Issues a short-lived, one-use, subject-bound HMAC token for the WebSocket handshake. The token is passed through the WebSocket subprotocol header and atomically consumed.

### `GET /api/v1/realtime/events`

Authenticated cursor catch-up endpoint. Query parameters:

```text
topics=staking.position,rewards.claim
after=<event_id>
```

Only public events or events belonging to the authenticated subject are returned.

### `GET /api/v1/endpoints`

Returns the discoverable v1 endpoint registry consumed by clients and operational tooling.

WebSocket protocol: `powerchain.realtime.v1`. See [REALTIME.md](REALTIME.md) for topic schemas, security limits and deployment behavior.

## Identity, confirmations and AI — v1.0.0

### API root
`GET /api/v1/` returns the canonical API version, protocol capability flags and links to major resources.

### Account identity
- `GET /api/v1/auth/identity`
- `GET /api/v1/auth/session`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/wallet/challenge`
- `POST /api/v1/auth/wallet/verify`
- Better Auth handler when enabled: `/api/auth/*`
- Clerk lifecycle webhook: `POST /api/webhooks/clerk`

Primary account authentication and wallet ownership are distinct. Wallet challenge creation binds the challenge to the currently authenticated account when `REQUIRE_PRIMARY_IDENTITY=true`.

### Exact-action confirmations
- `POST /api/v1/auth/confirmations/challenge`
- `POST /api/v1/auth/confirmations/verify`

Privileged off-chain endpoints that require an exact confirmation consume the one-time `x-powerchain-confirmation` token. The token is tied to the canonical payload SHA-256 hash and cannot be reused for a modified action.

### Trusted tokens
- `GET /api/v1/tokens/trusted`

The server-side CSV registry is a policy input, not a market-data source. Environment placeholders are resolved only from deployed token configuration.

### Secured AI
- `GET /api/v1/ai/capabilities`
- `POST /api/v1/ai/chat`

AI requests require account identity and the AI runtime control. Model/tool allowlists, request-size limits, sensitive-input screening and rate limits are enforced before the signed gateway call. Financial/state-changing AI execution is disabled by default.

## AI Runtime v2

### `GET /api/v1/ai/capabilities`
Returns enabled provider/model policy, assistants, skills, read-only tools, LoRA IDs, RAG policy and MPC authority status. It never returns provider secrets.

### `POST /api/v1/ai/chat`
Authenticated grounded Copilot request. Input supports `message`, `assistantId`, `style`, `provider`, `model`, optional allowlisted read-only `tools`, `conversationId`, and an allowlisted local `loraAdapter`. The response includes certainty, citations, unsupported claims, provider/model metadata and tool runs.

### `POST /api/v1/ai/rag/search`
Authenticated search over enabled, non-expired `AUTHORITATIVE`, `VERIFIED`, and `REFERENCE` knowledge chunks.

### `GET /api/v1/ai/conversations`
Lists the authenticated account's Copilot conversations.

### `GET /api/v1/ai/conversations/:id/messages`
Returns one authenticated account-owned conversation and its persisted messages.

### Provider / assistant metadata

- `GET /api/v1/ai/providers`
- `GET /api/v1/ai/assistants`
- `GET /api/v1/ai/skills`

## AI reliability APIs

```text
POST   /api/v1/ai/chat/stream
POST   /api/v1/ai/feedback
DELETE /api/v1/ai/conversations/:id
GET    /api/v1/admin/ai/overview
GET    /api/v1/admin/ai/evals
POST   /api/v1/admin/ai/evals
```

`/ai/chat/stream` uses `text/event-stream` and emits `accepted`, `stage`, `result`, and `error` events. Stage events expose policy/grounding/tool/provider/verification progress only. The final `result` is emitted after output DLP and citation verification; raw provider tokens are never forwarded directly to the browser.

Administrative AI endpoints require an authorized administrative wallet session.
