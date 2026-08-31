import { atomicString, jsonBody, ok, requireString, route, ApiError } from '@/lib/server/http';
import { requireSession } from '@/lib/server/session';
import { createRewardEpoch } from '@/lib/server/rewards';
import { db } from '@/lib/server/db';
import { consumeActionConfirmation } from '@/lib/auth/confirmations';
export const runtime = 'nodejs';
export const GET = route(async () => ok({ epochs: await db()`SELECT * FROM reward_epochs ORDER BY starts_at DESC` }));
export const POST = route(async (request: Request) => {
  const session = await requireSession(); const body = await jsonBody<Record<string, unknown>>(request); await consumeActionConfirmation(request,'rewards.epoch.create',body);
  const startsAt = new Date(requireString(body.startsAt, 'startsAt', 64)); const endsAt = new Date(requireString(body.endsAt, 'endsAt', 64));
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) throw new ApiError(400, 'INVALID_DATE', 'startsAt and endsAt must be valid ISO dates');
  const epoch = await createRewardEpoch(session, { poolId: requireString(body.poolId, 'poolId', 32), startsAt, endsAt, budgetAtomic: atomicString(body.budgetAtomic, 'budgetAtomic'), rewardVault: requireString(body.rewardVault, 'rewardVault', 128), policyVersion: requireString(body.policyVersion ?? 'REWARDS-1.0.0', 'policyVersion', 64) });
  return ok(epoch, { status: 201 });
});
