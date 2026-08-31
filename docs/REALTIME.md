# PowerChain Realtime Transport v1.0.0

PowerChain uses a dedicated authenticated WebSocket transport for **status and invalidation events**. It does not replace the authoritative REST API, PostgreSQL ledger, reconciliation engine, or immutable receipts.

## Invariant

```text
chain / worker / application state changes
                ↓
          PostgreSQL transaction
                ↓
       minimal realtime event
                ↓
       PostgreSQL NOTIFY/LISTEN
                ↓
          WebSocket client
                ↓
      invalidate affected query
                ↓
 authenticated GET /api/v1/...
                ↓
        authoritative state
```

Never calculate a balance, reward entitlement, governance weight, bridge reserve, staking principal, receipt, or settlement result from WebSocket payloads. Realtime payloads intentionally contain only routing/status metadata such as entity ID, lifecycle status, and database operation.

## Processes

The backend API and realtime transport are separate processes:

```text
apps/backend             Next.js API/BFF :4000
apps/backend/realtime    WebSocket service :4001
PostgreSQL               event persistence + NOTIFY/LISTEN
```

Development:

```bash
npm run dev:backend
npm run dev:realtime
```

Production:

```bash
npm run realtime:start
npm run realtime:check
```

`REALTIME_PUBLIC_URL` must use `wss://` in production.

## HTTP discovery and bootstrap

```text
GET  /api/v1/endpoints
GET  /api/v1/realtime/status
POST /api/v1/realtime/token
GET  /api/v1/realtime/events?topics=...&after=...
```

`POST /api/v1/realtime/token` requires the normal PowerChain platform identity. It returns a short-lived, one-use token. The browser sends that token as a WebSocket subprotocol value rather than a query parameter.

The token is HMAC-SHA-256 signed, subject-bound, expiry-bound, stored by JTI, atomically consumed during the WebSocket handshake, and cannot be replayed.

## WebSocket protocol

Protocol name:

```text
powerchain.realtime.v1
```

Client messages:

```json
{"type":"subscribe","topics":["staking.position"],"afterEventId":"1842"}
{"type":"unsubscribe","topics":["staking.position"]}
{"type":"ping","nonce":"optional"}
```

Server messages:

```text
ready
subscribed
unsubscribed
event
heartbeat
pong
error
```

Events use a monotonically increasing PostgreSQL `event_id`. The client retains the latest cursor and includes it on reconnect. The catch-up endpoint provides the same authenticated replay model when a socket cannot be used.

## Topics

```text
system.readiness
activity.event
portfolio.updated
staking.intent
staking.position
rewards.claim
rewards.epoch
rewards.coverage
governance.intent
governance.proposal
bonds.intent
bonds.position
wallet.transfer
wallet.balance
swap.intent
bridge.cctp
bridge.reserve
```

Subject-scoped events are delivered only to the authenticated subject. Network/global topics have no subject binding and still contain no privileged accounting payload.

## Security controls

The transport enforces:

- production origin allowlist;
- short-lived single-use access tokens;
- constant-time token signature comparison;
- per-subject connection ceiling;
- per-connection message-rate ceiling;
- subscription ceiling;
- message-size ceiling;
- server and application heartbeat checks;
- subject-scoped event filtering;
- bounded event retention;
- expired token cleanup;
- graceful shutdown;
- deep-readiness heartbeat verification.

The socket service never accepts wallet private keys, blockchain signatures, arbitrary SQL, prepared transactions, authoritative balances, or execution commands.

## Dashboard behavior

The dashboard uses one shared `PowerChainRealtimeClient` and one reference-counted realtime manager. Domain hooks subscribe only while a mounted surface needs a topic.

`useLiveQuery()` follows this policy:

1. Fetch authoritative REST state.
2. Subscribe to relevant invalidation topics.
3. Debounce bursts of events into one refresh.
4. Abort superseded requests.
5. If WebSocket is unavailable, use bounded fallback polling.
6. Never replace the cached authoritative response with the event payload.

Intent confirmation uses the same model: a matching intent event triggers an authoritative intent GET. A three-second fallback poll remains active so transaction confirmation does not depend exclusively on WebSocket delivery.

## Operational health

Realtime process endpoints:

```text
GET /healthz
GET /readyz
```

`/readyz` requires a fresh successful database heartbeat, not merely an allocated process.

Platform deep readiness also includes the `realtime_transport` check. Realtime can be disabled for an intentionally non-realtime deployment, but when it is enabled a stale or missing server heartbeat prevents execution readiness from being healthy.

## Persistence

Migration:

```text
apps/backend/db/migrations/013_realtime_transport.sql
```

Tables:

```text
realtime_access_tokens
realtime_events
realtime_server_heartbeats
```

Database triggers emit minimal invalidation events after successful inserts/updates of supported lifecycle tables. Events are committed with application state and then announced via `pg_notify('powerchain_realtime', event_id)`.

## Mainnet-beta checklist

Before enabling mainnet-beta execution:

1. Use a dedicated `wss://` realtime hostname behind TLS.
2. Configure a >=32-character `REALTIME_SIGNING_SECRET` independent from public configuration.
3. Restrict `APP_ORIGIN` / CORS origins to intended PowerChain hosts.
4. Apply migration `013_realtime_transport.sql`.
5. Start the realtime process and run `npm run realtime:check`.
6. Confirm `/api/v1/realtime/status` reports a fresh healthy runtime.
7. Confirm `/api/v1/system/readiness` includes a healthy `realtime_transport` check.
8. Verify reconnect/catch-up behavior before `EXECUTION_ENABLED=true`.

Realtime improves responsiveness. It does not weaken the core PowerChain rule: **backend reconciliation and accounting remain authoritative.**
