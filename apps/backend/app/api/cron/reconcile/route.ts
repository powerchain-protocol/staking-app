import { env } from '@/lib/server/config';
import { ApiError, ok, route } from '@/lib/server/http';
import { runReconciliation } from '@/lib/server/reconciliation';
import { systemHealth } from '@/lib/server/system-health';
import { timingSafeEqualString } from '@/lib/server/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (request: Request) => {
  const token = request.headers.get('authorization') ?? '';
  const expected = env.cronSecret ? `Bearer ${env.cronSecret}` : '';
  if (!expected || !timingSafeEqualString(token, expected)) throw new ApiError(401, 'CRON_AUTH_REQUIRED', 'Invalid cron authorization');
  const reconciliation = await runReconciliation();
  const readiness = await systemHealth(true);
  return ok({ reconciliation, readiness: { ok: readiness.ok, checkedAt: readiness.checkedAt, executionConfigFingerprint: readiness.executionConfigFingerprint } });
});
