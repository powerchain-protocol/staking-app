# PowerChain Staking v1.0.0 — Operations Control Plane

## Runtime controls

`EXECUTION_ENABLED=true` is necessary but no longer sufficient for state-changing requests. The database control plane can pause execution without a redeploy:

- `GLOBAL`
- `STAKING`
- `GOVERNANCE`
- `BONDS`
- `TRANSFERS`
- `REWARDS`
- `BRIDGE`

An authorized administrative wallet can inspect or change controls through `GET/POST /api/v1/admin/controls`. A disabled unexpired control causes mutation APIs to return `503 EXECUTION_PAUSED`.

## Automatic circuit breaker

When `AUTO_PAUSE_ON_RECONCILIATION_EXCEPTIONS=true`, a reconciliation run that exceeds `MAX_OPEN_RECONCILIATION_EXCEPTIONS` trips the global control. Re-enabling execution is an explicit administrative action after the underlying exception has been investigated.

## Webhook retry and dead-letter policy

Helius webhook records are durable. Failed processing uses exponential backoff controlled by `WEBHOOK_RETRY_BASE_SECONDS` and stops after `WEBHOOK_MAX_PROCESSING_ATTEMPTS`. Exhausted events are dead-lettered and surface as operational alerts/readiness failures rather than retrying forever.

## Operational alerts

`GET /api/v1/admin/alerts` exposes unresolved and historical alerts to authorized administrative wallets. Critical unresolved alerts make deep readiness unhealthy.

## Reconciliation exceptions

Open reconciliation exceptions remain visible and count against readiness. Authorized administrators may resolve an investigated exception through `POST /api/v1/admin/reconciliation/exceptions/:id/resolve` with an audit note.

## Mutation audit

Every POST/PUT/PATCH/DELETE API invocation emits a best-effort mutation audit event containing request ID, path, status, duration and error code. The audit path does not change the primary API outcome; missing migrations are caught by readiness.

## Recommended incident sequence

1. Disable the affected runtime control, or `GLOBAL` for uncertain blast radius.
2. Preserve chain observations, reconciliation exceptions and immutable receipts.
3. Verify Token-2022 PWRC, reward-vault coverage and bridge reserves.
4. Resolve root cause and reconciliation exceptions.
5. Run deep readiness until healthy.
6. Re-enable only the minimum required control.
7. Observe at least one full reconciliation cycle before broadening execution.

## Health and readiness semantics

Use `/api/v1/system/health` for lightweight service health and `/api/v1/system/readiness` for execution readiness. An intentional runtime execution pause may leave health green while readiness is red; this is expected and prevents orchestrators from restarting a deliberately paused service.

Deep readiness now explicitly fails on:

- dead-lettered unprocessed Helius events;
- unresolved critical operational alerts;
- stale reconciliation workers;
- excessive unresolved reconciliation exceptions;
- active runtime execution pauses;
- underfunded reward vaults; or
- undercollateralized/unverified PWRC/wPWRC bridge reserves.

## Reconciliation exception recovery

1. Inspect `GET /api/v1/admin/reconciliation/exceptions`.
2. Confirm the referenced chain transaction and root cause.
3. For a reviewable submitted intent, call `POST /api/v1/admin/reconciliation/exceptions/:id/requeue`.
4. Do **not** requeue a transaction that finalized as failed. Create a new user-approved intent instead.
5. Confirm the next worker run reconciles the intent and closes without recreating the exception.
6. Review the corresponding security event and mutation audit request ID.

The global circuit breaker now counts all unresolved reconciliation exceptions across runs. Resolving or requeueing exceptions is therefore part of restoring execution after an exception-backlog pause.

## Operator telemetry

Use `GET /api/v1/admin/operations` for the compact operator view. Correlate incidents through `x-request-id`/`x-trace-id`, mutation audit events, security events and reconciliation run IDs.

## Realtime operations

Use `npm run realtime:check` to verify that the dedicated WebSocket service has a fresh database heartbeat. `/healthz` indicates that the process is alive; `/readyz` additionally requires a recent successful PostgreSQL heartbeat. `/api/v1/realtime/status` exposes the current server instance age, connection count and event cursor without exposing subscriber identities.

If realtime is degraded, keep the REST API available. Dashboard live queries automatically fall back to polling. Do not repair realtime by copying financial values into socket messages; restore the transport and let clients refresh authoritative endpoints.
