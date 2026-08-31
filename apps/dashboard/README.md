# @powerchain/dashboard

PowerChain Staking v1.0.0 authenticated dashboard. The UI follows the supplied PowerChain reference layouts and calls the backend through the same-origin `/api/*` proxy.

Identity defaults to Clerk. Set `NEXT_PUBLIC_AUTH_PROVIDER=better-auth` only when the backend is intentionally configured for Better Auth. Account sign-in, wallet ownership verification and transaction signatures remain separate security boundaries.

```bash
cp apps/dashboard/.env.example apps/dashboard/.env.local
npm run dev:dashboard
```

No chain/provider secret belongs in a `NEXT_PUBLIC_*` variable.

## Copilot

`/copilot` is the evidence-first AI workspace. It supports assistant selection, professional response styles, provider/model routing, allowlisted local LoRA adapters, read-only tools, persistent conversations, citations and certainty labels. If evidence required by the selected assistant is not available, the UI receives an explicit unavailable/abstention response rather than invented operational state.


## Realtime hooks

The dashboard has one shared authenticated WebSocket manager. `useLiveQuery()` combines authoritative REST reads with debounced realtime invalidation and bounded fallback polling. Domain hooks for staking, rewards, governance, wallet balances, system status and intents reuse this transport. Event payloads never replace authoritative financial state.

`NEXT_PUBLIC_REALTIME_ENABLED=false` disables socket subscriptions without changing REST correctness.
