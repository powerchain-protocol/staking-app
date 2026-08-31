# PowerChain Staking Platform

**PowerChain Renewable RWA + Staking v1.0.0** is a production-oriented, multi-chain platform for PWRC staking, renewable-infrastructure participation, rewards, governance, network assurance, portfolio operations, payments, and evidence-grounded AI assistance.

> **Status:** `v1.0.0` · `devnet` + gated `mainnet-beta` · execution fail-closed by default

PowerChain ships as one monorepo containing the public web experience, authenticated dashboard, backend/API, workers/indexers, shared packages, Solana programs, Sui Move package, accounting/reconciliation services, and secured Copilot runtime.

---

## Core Features

| Domain | Core capabilities |
| --- | --- |
| **Staking** | Flexible/fixed PWRC staking, increase, claim, compound, unstake, cooldown/unbonding, withdraw, indexed positions |
| **Rewards** | Funded epochs, cumulative indexes, vault solvency, claim accounting, immutable reward receipts |
| **Governance** | Proposals, voting weight, signed vote intents, quorum/timelock policy, reconciled execution |
| **Network** | Operator/verifier bonds, slashable service collateral, oracle/DePIN visibility, runtime health/readiness |
| **PWRC** | Solana Token-2022 validation, balances, transfers, Solana Pay, trusted-token policy |
| **Cross-chain** | PWRC ↔ wPWRC reserve verification, Sui gRPC, Sui Move bridge, CCTP V2 boundary |
| **Portfolio** | Accounts, wallets, tokens, balances, positions, activity, histories, fees, claims |
| **Liquidity** | Jupiter, Meteora, Orca, Raydium, Cetus and DeepBook integration boundaries |
| **Market data** | Pyth, CoinGecko, CoinMarketCap, Birdeye and explorer/provider adapters |
| **Identity** | Clerk primary auth, optional Better Auth, social login, wallet ownership signatures, account-wallet binding |
| **Security** | Exact-action confirmations, replay protection, rate limits, runtime kill switches, audit/security events |
| **Accounting** | PostgreSQL, Prisma, double-entry ledger, reconciliation exceptions, hash-linked immutable receipts |
| **AI Copilot** | Multi-provider LLMs, RAG, MCP read tools, local/LoRA, evals, grounding/citation enforcement, abstention |
| **Operations** | Helius/webhook ingestion, workers, indexers, observability, circuit breakers, recovery/admin controls |

---

## Architecture

```text
PowerChain
├── apps/
│   ├── web/          public product, Learn, legal
│   ├── dashboard/    authenticated operational application
│   └── backend/      API, chain services, accounting, workers, AI
├── packages/
│   ├── ui/           canonical UI tokens and primitives
│   ├── contracts/    shared API/runtime contracts
│   ├── api-client/   typed client boundary
│   ├── core/         domain utilities
│   └── integrations/ provider abstractions
├── programs/
│   ├── solana/       staking, governance, bonds, bridge
│   └── sui/          wPWRC Move package
├── skills/           AI assistants, agents, skills, character policy
├── docs/             architecture, API, security, operations, production
└── scripts/          release/security/AI/design/integration audits
```

The dashboard proxies same-origin `/api/*` requests to the backend. Provider credentials, signing policy, RPC secrets, database credentials and service-role keys remain server-side.

---

## Trust Model

PowerChain separates **account identity**, **wallet ownership**, **transaction authorization**, **accounting truth**, and **AI authority**.

```text
Clerk / Better Auth
        ↓
wallet ownership challenge
        ↓
account ↔ wallet binding
        ↓
server-authoritative intent
        ↓
exact-action confirmation when required
        ↓
prepared transaction integrity
        ↓
user wallet signature
        ↓
chain finality
        ↓
reconciliation
        ↓
double-entry ledger
        ↓
immutable receipt
```

Social login authenticates the account only. It never grants wallet spending authority. The server does not custody user wallet private keys.

AI/MCP is read-oriented and independently policy-gated. AI cannot access MPC/threshold key shares, sign wallet messages or transactions, stake, claim, transfer, bridge, vote, or bypass readiness/reconciliation/accounting controls.

---

## Product Surfaces

```text
Overview      Copilot       Stake         Positions
Rewards       Claim         PWRC          Governance
Network       Portfolio     Accounts      Wallets
Histories     Activity      Leaderboard   Integrations
Bridge        Explorer      Profiles      Settings
Security      Learn
```

Account-specific balances, positions, rewards, votes and transaction states must come from authoritative backend/indexer data. Representative aggregate data must be explicitly labelled.

---

## Networks & Integrations

### Solana

PWRC Token-2022 · Anchor staking/governance/bonds/bridge · Helius/configured RPC · Solana Pay · Jupiter · Meteora · Orca · Raydium · Pyth · Metaplex/DAS boundary · Solscan · Circle CCTP V2

### Sui

wPWRC · Sui gRPC · Move bridge package · Cetus · DeepBook · Suiscan

### Platform

PostgreSQL · Prisma · Supabase boundary · Clerk · Better Auth · CoinGecko · CoinMarketCap · Birdeye

All integrations are server-side policy boundaries. Missing production credentials or unsupported capabilities must fail closed rather than fabricate state.

---

## API

Canonical namespace:

```text
/api/v1/
```

Primary domains:

```text
auth        system       staking      positions
actions     rewards      claim        governance
bonds       wallet       transfers    portfolio
accounts    histories    prices       swaps
solana-pay  cctp         bridge       programs
integrations tokens      ai           admin
```

Service health and execution readiness are deliberately separate:

```text
GET /api/v1/system/health
GET /api/v1/system/readiness
```

A healthy service does not automatically mean state-changing execution is permitted.

See [API](docs/API.md).

---

## Realtime API

PowerChain uses a dedicated authenticated WebSocket process for fast lifecycle invalidation while keeping HTTP, PostgreSQL, reconciliation and the double-entry ledger authoritative.

```text
PostgreSQL transaction
  → minimal realtime event
  → NOTIFY/LISTEN
  → authenticated WebSocket
  → dashboard invalidates query
  → GET /api/v1/... authoritative refresh
```

Bootstrap and discovery:

```text
GET  /api/v1/endpoints
GET  /api/v1/realtime/status
POST /api/v1/realtime/token
GET  /api/v1/realtime/events
```

Run the transport independently:

```bash
npm run dev:realtime
npm run realtime:start
npm run realtime:check
```

The socket carries status/invalidation metadata only. It never becomes the source of truth for balances, positions, rewards, governance weight, bridge coverage, receipts or settlement. See [Realtime](docs/REALTIME.md).

---

## Secured AI Runtime

PowerChain Copilot uses an evidence-first pipeline:

```text
request
  ↓
identity + AI policy
  ↓
trusted RAG + verified read tools
  ↓
evidence scoring + typed tool contracts
  ↓
allowlisted model/provider
  ↓
DLP + grounding/citation verification
  ↓
VERIFIED / GROUNDED / INFERENCE / UNAVAILABLE
```

The runtime includes provider health/circuit breakers, failover, immutable prompt fingerprints, trust-tiered RAG, MCP read-only tools, local/LoRA adapters, bounded memory, output DLP, policy evals, progress streaming and explicit abstention when evidence is insufficient.

No LLM can guarantee literal zero hallucinations; PowerChain instead prevents unsupported operational claims from being presented as verified facts.

See [AI Runtime](docs/AI_RUNTIME.md), [AI Evals](docs/AI_EVALS.md), and [AI Security](docs/AI_SECURITY.md).

---

## Runtime Safety

State-changing execution is fail-closed:

```text
EXECUTION_ENABLED
        ↓
valid deployment configuration
        ↓
runtime control enabled
        ↓
fresh readiness attestation
        ↓
PWRC Token-2022 valid
        ↓
programs verified
        ↓
reward vault solvent
        ↓
PWRC/wPWRC reserve covered
        ↓
workers/indexers healthy
        ↓
no blocking operational alert
        ↓
EXECUTE
```

Critical configuration changes invalidate previous readiness evidence. Runtime controls can pause staking, governance, bonds, transfers, rewards, bridge, AI, or global execution without redeployment.

---

## Canonical UI

PowerChain uses a restrained monochromatic system with controlled operational green:

```text
Canvas             #ffffff
Soft surface       #f5f5f5
Subtle surface     #fafafa
Primary            #0a0a0a
Secondary text     #525252
Muted text         #737373
Border             #e5e5e5
Operational green  #0b6b38
Destructive        #e7000b
```

Black is the default primary action. Dark green is reserved for PowerChain operational/verified/energy semantics. Red is destructive/failure only. Interactive geometry is `18px`; cards/containers are `24px`. No gradients, glassmorphism, colored shadows or decorative chromatic palettes.

See [Design System](docs/DESIGN_SYSTEM.md) and [UI/UX](docs/UI_UX.md).

---

## Local Development

### Requirements

- Node.js `>=22`
- npm `10.9.x`
- PostgreSQL
- Anchor/Solana CLI only when building Solana programs
- Sui CLI only when building/testing Move programs

### Setup

```bash
npm install

cp apps/backend/.env.example apps/backend/.env.local
cp apps/dashboard/.env.example apps/dashboard/.env.local
cp apps/web/.env.example apps/web/.env.local

npm run prisma:generate
npm run db:migrate
npm run ai:ingest
npm run dev
```

Run applications individually with:

```bash
npm run dev:web
npm run dev:dashboard
npm run dev:backend
```

---

## Environments

Supported deployment profiles:

```text
devnet
mainnet-beta
```

Mainnet-beta remains disabled until real PWRC/program/vault/bridge values, RPC/provider credentials, auth secrets and service integrations are configured and verified. Never promote placeholder program IDs, sample wallet addresses or representative data into production.

See [Production](docs/PRODUCTION.md) and [Programs](docs/PROGRAMS.md).

---

## Workers & Accounting

PostgreSQL is the authoritative application/accounting store. Finalized chain transactions are reconciliation evidence, not a replacement for the internal ledger.

```bash
npm run worker:reconcile
npm run worker:reconcile:loop
npm run worker:index
npm run worker:index:loop
```

The persistence layer includes staking/reward/governance/bond state, identity/wallet bindings, double-entry journals, immutable receipts, reconciliation exceptions, webhook observations, provider telemetry, AI/RAG state and worker/indexer health.

---

## Validation

Dependency-free platform validation:

```bash
npm run validate:release
```

This runs source, program compatibility, integrations, auth/security, AI runtime, canonical design-system, UI integrity and platform-release audits.

Production release additionally requires:

```bash
npm install
npm run prisma:generate
npm run prisma:validate
npm run typecheck
npm run build
npm run programs:build
npm run programs:test
npm run programs:sui:build
npm run programs:sui:test
```

Do not set `EXECUTION_ENABLED=true` until `/api/v1/system/health` and `/api/v1/system/readiness` are healthy and the intended deployment has verified Token-2022 configuration, executable programs, reward-vault solvency, bridge reserve coverage and worker freshness.

---

## Documentation

| Document | Purpose |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | System boundaries and service topology |
| [API](docs/API.md) | Backend/API contracts |
| [Realtime](docs/REALTIME.md) | WebSocket protocol, invalidation model and deployment |
| [Production](docs/PRODUCTION.md) | Deployment and mainnet-beta gates |
| [Operations](docs/OPERATIONS.md) | Runtime operations and recovery |
| [Observability](docs/OBSERVABILITY.md) | Tracing, metrics and operational telemetry |
| [Security](SECURITY.md) | Platform security policy |
| [Auth Security](docs/AUTH_SECURITY.md) | Identity, wallet and confirmation model |
| [Programs](docs/PROGRAMS.md) | Solana/Sui protocol workspace |
| [AI Runtime](docs/AI_RUNTIME.md) | Copilot/RAG/MCP/provider architecture |
| [AI Security](docs/AI_SECURITY.md) | AI authority and safety boundaries |
| [Design System](docs/DESIGN_SYSTEM.md) | Canonical UI tokens and rules |
| [Release Validation](RELEASE_VALIDATION.md) | Verified release gates and limitations |

---

## Version

**Canonical product version: `1.0.0`.**

Production hardening, protocol wiring, AI-runtime improvements and UI refinement continue under the v1.0.0 baseline unless a product-level version change is explicitly approved. Release history belongs in [`CHANGELOG.md`](CHANGELOG.md); this README remains the concise product and engineering entry point.
