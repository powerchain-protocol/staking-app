# PowerChain Staking v1.0.0 — Monorepo Architecture

## Web
`apps/web` is the public product and learning surface. It contains no wallet custody or state-changing protocol code. It routes participants to the staking dashboard.

## Dashboard
`apps/dashboard` implements the supplied UI/UX references. Browser calls use same-origin `/api/*`; Next rewrites them to `BACKEND_URL`. The dashboard never owns canonical balances, reward amounts, governance weight, settlement state or receipt state.

## Backend
`apps/backend` owns wallet challenges/sessions, Token-2022 validation, staking/governance/bond/transfer intents, Solana RPC/Helius, indexing/reconciliation, reward epoch accounting, double-entry journals, immutable receipts, operational controls and PWRC/wPWRC reserve verification.

## Trust boundary
```text
Browser UI
  ↓ authenticated request
Backend policy + authoritative database
  ↓ prepared exact message
User wallet signature
  ↓
Solana / Sui observations
  ↓ finalized verification
Reconciliation
  ↓
Ledger + receipt + indexed read model
```

Submission is not success. The UI may display completion only after reconciliation.


## On-chain protocol workspace

The repository now includes a first-class `/programs` layer rather than treating chain execution as external infrastructure:

```text
apps/dashboard
      ↓
apps/backend
      ↓ exact prepared instruction encoding
programs/solana/staking
programs/solana/governance
programs/solana/bonds
programs/solana/bridge
      ↕ verified reserve invariant
programs/sui/wpwrc_bridge
```

Deep readiness verifies executable program accounts and the PDA/vault topology derived from those program IDs. See `PROGRAMS.md` for the instruction, PDA and initialization contract.


## Realtime transport

The realtime process is deployed separately from the Next.js backend. PostgreSQL triggers write minimal lifecycle events into `realtime_events` in the same committed state domain and announce event IDs through `pg_notify`. The WebSocket service uses `LISTEN powerchain_realtime`, authenticates a one-use subject token, filters subject-scoped events, and broadcasts only subscribed topics.

```text
apps/backend API ───────┐
workers/indexer ────────┼─→ PostgreSQL ─→ realtime_events ─→ NOTIFY
program reconciliation ┘                              ↓
                                           realtime/server.ts
                                                    ↓
                                            dashboard client
                                                    ↓
                                       authoritative REST refresh
```

This deliberately avoids a second accounting state machine inside WebSockets. Reconnect uses an event cursor plus authenticated catch-up; fallback polling preserves correctness when realtime is unavailable. See [REALTIME.md](REALTIME.md).
