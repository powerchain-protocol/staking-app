import { env } from '@/lib/server/config';
import { ApiError, ok, route } from '@/lib/server/http';
import { runReconciliation } from '@/lib/server/reconciliation';
import { systemHealth } from '@/lib/server/system-health';
import { timingSafeEqualString } from '@/lib/server/crypto';

export const runtime = 'nodejs';

export const POST = route(async (request: Request) => {
  const token = request.headers.get('authorization') ?? '';
  const expected = env.workerSecret ? `Bearer ${env.workerSecret}` : '';
  if (!expected || !timingSafeEqualString(token, expected)) throw new ApiError(401, 'WORKER_AUTH_REQUIRED', 'Invalid worker authorization');
  const reconciliation = await runReconciliation();
  const readiness = await systemHealth(true);
  return ok({ reconciliation, readiness: { ok: readiness.ok, checkedAt: readiness.checkedAt, executionConfigFingerprint: readiness.executionConfigFingerprint } });
});
