import 'server-only';
import { createHash } from 'node:crypto';
import { ApiError } from './http';
import { requireSession } from './session';
import { enforceRuntimeAction } from '@/lib/security/actions';

export type SafeActionContext = {
  subjectId: string;
  walletAddress: string;
  idempotencyKey: string;
  actionHash: string;
};

export function canonicalActionHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value, Object.keys(value as any ?? {}).sort())).digest('hex');
}

export async function safeAction(request: Request, action: string, payload: unknown): Promise<SafeActionContext> {
  const session = await requireSession();
  const idempotencyKey = request.headers.get('x-idempotency-key')?.trim();
  if (!idempotencyKey || idempotencyKey.length > 128) throw new ApiError(400, 'IDEMPOTENCY_REQUIRED', 'x-idempotency-key is required');
  await enforceRuntimeAction(action);
  return {
    subjectId: session.sub,
    walletAddress: session.wallet,
    idempotencyKey,
    actionHash: canonicalActionHash(payload),
  };
}
