# Release Validation — PowerChain Staking v1.0.0

**Build:** Realtime API + Typed Contracts + Canonical UI + AI Runtime v3  
**Canonical product version:** `1.0.0`  
**Realtime protocol:** `powerchain.realtime.v1`  
**AI policy layer:** `ai-runtime-v3`  
**Visual system:** `powerchain-canonical-ui-v1`  
**Validation date:** 2026-08-31

## Passed dependency-free gates

| Gate | Result |
|---|---:|
| TypeScript source transpilation | **439 files PASS** |
| `/programs` compatibility audit | **49 checks PASS** |
| Integration audit | **71 checks PASS** |
| Clerk / Better Auth / identity security audit | **56 checks PASS** |
| AI runtime / RAG / MCP / MPC reliability audit | **84 checks PASS** |
| Canonical design-system audit | **695 checks PASS** |
| UI integrity audit | **171 checks PASS** |
| Realtime transport audit | **79 checks PASS** |
| Platform release audit | **216 checks PASS** |
| Source checksum manifest | **551 files VERIFIED** |
| Placeholder `href="#"` links | **0** |
| Inert dashboard/web buttons detected | **0** |

## Realtime/API contract verified

The release adds a dedicated authenticated WebSocket process while preserving the existing accounting trust boundary.

Verified controls include:

- protocol `powerchain.realtime.v1`;
- migration `013_realtime_transport.sql`;
- PostgreSQL `NOTIFY/LISTEN` transport;
- short-lived, one-use, subject-bound HMAC access tokens;
- constant-time token signature verification;
- atomic handshake token consumption;
- production origin validation;
- `wss://` enforcement for production `REALTIME_PUBLIC_URL`;
- per-subject connection ceilings;
- per-connection message-rate ceilings;
- subscription ceilings;
- payload-size ceilings;
- WebSocket ping/pong and application heartbeats;
- `/healthz` and database-heartbeat-backed `/readyz`;
- persisted monotonic event cursor and authenticated catch-up;
- bounded event/token retention;
- deep-readiness `realtime_transport` verification;
- dashboard reconnect/backoff and fallback polling;
- subject-scoped event filtering;
- minimal status/invalidation payloads only.

**WebSocket state is not authoritative.** Balances, staking positions, claimable rewards, governance weight, bridge reserve coverage, receipts, settlement and ledger state are always refreshed from authenticated REST/backend state after an event.

## Typed endpoint/action layer

The shared `@powerchain/contracts` workspace now owns:

- `/api/v1` endpoint constants;
- execution-intent path construction for staking, governance, bonds, Token-2022 transfers, swaps and CCTP;
- endpoint registry types;
- action registry types;
- intent lifecycle types;
- realtime topics/messages/status types.

The shared API client owns timeout, retry and idempotency behavior. The dashboard action layer reuses the same execution-path contract, removing duplicate route builders.

## Dashboard live-state model

The dashboard has one reference-counted authenticated realtime manager and domain hooks for staking, rewards, governance, wallet balances, system status and transaction intents.

`useLiveQuery()` performs an authoritative REST fetch, subscribes to relevant invalidation topics, debounces refresh bursts, aborts superseded requests, and uses bounded polling when the realtime connection is not open.

Intent confirmation follows the same model: a socket event causes an authoritative intent GET; a three-second fallback poll remains active so finality UX cannot fail solely because a WebSocket message was lost.

## Security and protocol boundaries retained

The release preserves all existing controls for:

- Clerk / Better Auth identity;
- wallet ownership signatures;
- exact-action confirmations;
- no server-side user private keys;
- PWRC Token-2022 validation;
- wallet-approved prepared transactions;
- finalized-chain reconciliation;
- funded reward-vault accounting;
- governance execution policy;
- operator/verifier service bonds;
- PWRC/wPWRC reserve coverage;
- double-entry ledger;
- immutable receipts;
- AI/RAG/MCP read-only policy;
- MPC and wallet-signing isolation from AI.

## Canonical visual contract retained

The release continues to enforce the PowerChain canonical visual system: black primary actions, operational dark green only where semantically meaningful, destructive red only for failures/destructive actions, 18px interactive geometry, 24px containers, mandatory card hairlines, Geist-first typography, solid white/neutral surfaces, and no gradients/glass/colored shadows.

## Dependency/toolchain-resolved gates

A package-registry install was attempted during this release pass:

```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
```

The operation timed out before creating `node_modules` or a lockfile. Consequently, the following are **not** represented as completed in this environment and remain mandatory in a network/toolchain-enabled CI environment:

```bash
npm install
npm run prisma:generate
npm run prisma:validate
npm run typecheck
npm run build
npm run realtime:check
npm run programs:build
npm run programs:test
npm run programs:sui:build
npm run programs:sui:test
```

`npm run realtime:check` additionally requires a configured PostgreSQL database, applied migration `013_realtime_transport.sql`, and a running realtime service.

## Mainnet-beta promotion gates

Before `EXECUTION_ENABLED=true`:

1. Configure production account/wallet/auth secrets and actual deployed program/mint/vault addresses.
2. Configure `REALTIME_PUBLIC_URL` to the deployed `wss://` host and a >=32-character signing secret.
3. Apply all database migrations through `013_realtime_transport.sql`.
4. Confirm `/api/v1/system/health` is healthy.
5. Confirm `/api/v1/system/readiness` is healthy, including `realtime_transport`.
6. Confirm `/api/v1/realtime/status` reports a fresh healthy runtime.
7. Confirm PWRC Token-2022 policy, program topology, reward-vault solvency and PWRC/wPWRC bridge reserve coverage.
8. Confirm reconciliation/indexer freshness and receipt-chain integrity.
9. Run dependency-resolved application, Anchor and Sui Move builds/tests.
10. Exercise reconnect/cursor catch-up under network interruption before mainnet-beta traffic.

## Release conclusion

All dependency-free source, protocol, integration, identity, AI, canonical-design, UI-integrity, realtime and platform-release gates pass. The product remains **PowerChain Staking v1.0.0**; this is a transport/API/runtime hardening build rather than a semantic version increment.
