# @powerchain/backend

PowerChain Staking v1.0.0 authoritative API/BFF, chain services, workers and accounting boundary.

Core responsibilities: Clerk/Better Auth account verification, wallet ownership challenges, exact-action confirmations, Token-2022 validation, staking/rewards/governance/bonds, swaps/CCTP/Solana Pay, PWRC/wPWRC reserve verification, reconciliation, double-entry ledger, immutable receipts, AI compute policy and operational readiness.

Run from repository root:

```bash
cp apps/backend/.env.example apps/backend/.env.local
npm run db:migrate
npm run dev:backend
```

Production starts fail-closed. Do not set `EXECUTION_ENABLED=true` until `/api/v1/system/readiness` is healthy and chain/reward/bridge attestations are current. See `docs/PRODUCTION.md`, `docs/AUTH_SECURITY.md` and `docs/AI_SECURITY.md`.

## AI runtime

The backend owns all Copilot security and grounding logic. Key modules are under `lib/ai/`: provider routing, assistant/skill catalog, deterministic read-tool planner, trusted RAG, factual-citation verification, MCP policy, MPC denial boundary and response styles.

After migrations, ingest canonical repository knowledge with:

```bash
npm run ai:ingest
```

Useful endpoints:

- `GET /api/v1/ai/capabilities`
- `GET /api/v1/ai/providers`
- `GET /api/v1/ai/assistants`
- `GET /api/v1/ai/skills`
- `POST /api/v1/ai/rag/search`
- `GET /api/v1/ai/conversations`
- `GET /api/v1/ai/conversations/:id/messages`
- `POST /api/v1/ai/chat`

AI cannot sign, submit, reconcile or authorize blockchain state changes.


## Realtime transport

Realtime runs as a dedicated WebSocket process backed by PostgreSQL `NOTIFY/LISTEN`. It publishes invalidation/status events only; REST, reconciliation and the ledger remain authoritative.

```bash
npm run dev:realtime
npm run realtime:start
npm run realtime:check
```

Apply migration `013_realtime_transport.sql` and configure `REALTIME_PUBLIC_URL`, `REALTIME_SIGNING_SECRET`, heartbeat/limit variables, and allowed origins. Production requires `wss://`. See `docs/REALTIME.md`.
