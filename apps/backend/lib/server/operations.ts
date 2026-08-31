import 'server-only';
import { db } from './db';
import { env } from './config';
import { listRuntimeControls } from './controls';

function ageSeconds(value: unknown) {
  if (!value) return null;
  const n = new Date(String(value)).getTime();
  return Number.isFinite(n) ? Math.max(0, Math.floor((Date.now() - n) / 1000)) : null;
}

export async function operationalOverview() {
  const sql = db();
  const [latestRunRows, exceptions, webhooks, alerts, readinessRows, mutationRows, controls] = await Promise.all([
    sql`SELECT id,status,processed_count,exception_count,started_at,finished_at FROM reconciliation_runs ORDER BY started_at DESC LIMIT 1`,
    sql`SELECT COUNT(*)::int AS open,COUNT(*) FILTER (WHERE retry_count>0)::int AS retried FROM reconciliation_exceptions WHERE resolved_at IS NULL`,
    sql`SELECT COUNT(*) FILTER (WHERE processed_at IS NULL AND dead_lettered_at IS NULL)::int AS pending,COUNT(*) FILTER (WHERE dead_lettered_at IS NOT NULL AND processed_at IS NULL)::int AS dead_lettered FROM chain_webhook_events`,
    sql`SELECT COUNT(*) FILTER (WHERE severity='CRITICAL')::int AS critical,COUNT(*) FILTER (WHERE severity='WARNING')::int AS warning FROM operational_alerts WHERE resolved_at IS NULL`,
    sql`SELECT status,created_at,details FROM operational_snapshots WHERE snapshot_type='READINESS' ORDER BY created_at DESC LIMIT 1`,
    sql`SELECT COUNT(*)::int AS requests,COUNT(*) FILTER (WHERE status_code>=500)::int AS server_errors,COUNT(*) FILTER (WHERE status_code>=400)::int AS errors,COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms),0)::numeric AS p95_ms FROM mutation_audit_events WHERE created_at >= now()-interval '15 minutes'`,
    listRuntimeControls(),
  ]);
  const latestRun = latestRunRows[0] ?? null;
  const readiness = readinessRows[0] ?? null;
  const m = mutationRows[0] ?? { requests: 0, server_errors: 0, errors: 0, p95_ms: 0 };
  return {
    version: '1.0.0',
    executionEnabled: env.executionEnabled,
    reconciliation: latestRun ? { ...latestRun, ageSeconds: ageSeconds(latestRun.finished_at ?? latestRun.started_at) } : null,
    exceptions: { open: Number(exceptions[0]?.open ?? 0), retriedOpen: Number(exceptions[0]?.retried ?? 0), policyLimit: env.maxOpenReconciliationExceptions },
    webhooks: { pending: Number(webhooks[0]?.pending ?? 0), deadLettered: Number(webhooks[0]?.dead_lettered ?? 0) },
    alerts: { critical: Number(alerts[0]?.critical ?? 0), warning: Number(alerts[0]?.warning ?? 0) },
    readiness: readiness ? { status: readiness.status, checkedAt: readiness.created_at, ageSeconds: ageSeconds(readiness.created_at), fingerprint: readiness.details?.executionConfigFingerprint ?? null } : null,
    mutations15m: { requests: Number(m.requests), errors: Number(m.errors), serverErrors: Number(m.server_errors), p95Ms: Number(m.p95_ms) },
    controls,
    checkedAt: new Date().toISOString(),
  };
}
