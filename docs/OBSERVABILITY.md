# PowerChain Staking v1.0.0 — Observability & Recovery

## Request correlation

Every API request handled through the shared route wrapper receives:

- `x-request-id`
- `x-trace-id`
- `server-timing: app;dur=<milliseconds>`

A valid caller-supplied `x-request-id` is preserved. W3C `traceparent` trace IDs are propagated when present; otherwise a cryptographically random trace ID is created.

Authenticated session context annotates the request with the PowerChain subject and wallet address. State-changing request audit rows therefore retain the request ID, subject, wallet, route, status, latency and error code.

Structured server logs are emitted as JSON and include the same request/trace identifiers. Secrets, signed transactions and private keys must never be placed in log metadata.

## Health vs readiness

`GET /api/v1/system/health` is intentionally lightweight. It confirms application configuration, database connectivity and the latest required database migration. An intentional emergency execution pause does not make the service appear crashed.

`GET /api/v1/system/readiness` is the execution safety gate. It additionally verifies Solana RPC, PWRC Token-2022 policy, deployed programs, embedded-wallet configuration, Helius webhook configuration, runtime execution controls, receipt-chain integrity, reconciliation backlog, worker freshness, webhook dead letters, critical operational alerts, reward-vault solvency and PWRC/wPWRC bridge reserve coverage.

State-changing requests rely on fresh readiness and solvency/reserve attestations through the runtime safety gate.

## Administrative operational overview

`GET /api/v1/admin/operations` requires an authorized administrative wallet and returns a consolidated operational snapshot:

- latest reconciliation run and age
- unresolved reconciliation exceptions
- webhook pending/dead-letter counts
- open operational alerts
- latest readiness attestation
- 15-minute mutation request/error counts and p95 latency
- runtime execution controls

This endpoint is intended for operator dashboards and incident response, not public telemetry.

## Exception recovery

`GET /api/v1/admin/reconciliation/exceptions` lists open exceptions.

`POST /api/v1/admin/reconciliation/exceptions/:id/requeue` can requeue only an existing submitted intent with an existing chain signature. A transaction that finalized as failed cannot be requeued; a new intent must be created after review.

A requeue:

1. locks the exception and source intent;
2. validates that the source is requeueable;
3. resets the intent to `SUBMITTED`;
4. clears its reconciliation lease;
5. resolves the old exception as `REQUEUED_FOR_RECONCILIATION`;
6. increments retry metadata; and
7. records a security event bound to the administrative wallet and request ID.

## Circuit breaker

The automatic circuit breaker evaluates the actual number of unresolved reconciliation exceptions after each run, not only exceptions produced by that run. If the unresolved population exceeds `MAX_OPEN_RECONCILIATION_EXCEPTIONS`, `GLOBAL` execution is paused.

## Retention

Operational readiness snapshots are pruned after 30 days by the health subsystem. Deployment-specific log and database retention should be configured according to audit, privacy and incident-response requirements.
