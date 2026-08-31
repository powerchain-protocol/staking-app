import { jsonBody, ok, requireString, route, ApiError } from '@/lib/server/http';
import { requireSession } from '@/lib/server/session';
import { createGovernanceIntent } from '@/lib/server/governance';
import { enforceRateLimit, rateLimitKey } from '@/lib/server/rate-limit';
export const runtime = 'nodejs';
export const POST = route(async (request: Request) => {
  const session = await requireSession(); await enforceRateLimit(rateLimitKey('governance-intent',session.sub),30,60); const body = await jsonBody<Record<string, unknown>>(request);
  const action = requireString(body.action, 'action', 16).toUpperCase() as 'VOTE' | 'EXECUTE';
  if (!['VOTE','EXECUTE'].includes(action)) throw new ApiError(400, 'INVALID_ACTION', 'action must be VOTE or EXECUTE');
  const idem=requireString(request.headers.get('idempotency-key') ?? body.idempotencyKey ?? '','idempotencyKey',128);
  return ok(await createGovernanceIntent(session, { action, proposalId: requireString(body.proposalId, 'proposalId', 64), choice: typeof body.choice === 'string' ? body.choice.toUpperCase() as any : undefined, idempotencyKey: idem }), { status: 201 });
});
