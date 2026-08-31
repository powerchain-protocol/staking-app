import { atomicString, jsonBody, ok, requireString, route, ApiError } from '@/lib/server/http';
import { requireSession } from '@/lib/server/session';
import { stakingService, type StakingAction } from '@/services/staking.service';
import { enforceRateLimit, rateLimitKey } from '@/lib/server/rate-limit';
export const runtime = 'nodejs';
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  await enforceRateLimit(rateLimitKey('staking-intent',session.sub),30,60);
  const body = await jsonBody<Record<string, unknown>>(request);
  const action = requireString(body.action, 'action', 32).toUpperCase() as StakingAction;
  if (!['STAKE','INCREASE','REQUEST_UNSTAKE','CANCEL_UNSTAKE','WITHDRAW','CLAIM','COMPOUND'].includes(action)) throw new ApiError(400, 'INVALID_ACTION', 'Unsupported staking action');
  const idempotencyKey=requireString(request.headers.get('idempotency-key') ?? body.idempotencyKey ?? '','idempotencyKey',128);
  const amountAtomic = body.amountAtomic == null ? null : atomicString(body.amountAtomic, 'amountAtomic');
  const result = await stakingService.createIntent(session, {
    action,
    poolId: typeof body.poolId === 'string' ? body.poolId : null,
    positionId: typeof body.positionId === 'string' ? body.positionId : null,
    amountAtomic,
    idempotencyKey,
  });
  return ok(result, { status: 201 });
});
