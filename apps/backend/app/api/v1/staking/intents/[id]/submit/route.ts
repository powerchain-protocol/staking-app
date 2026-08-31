import { jsonBody, ok, requireString, route } from '@/lib/server/http';
import { requireSession } from '@/lib/server/session';
import { stakingService } from '@/services/staking.service';
export const runtime = 'nodejs';
export const POST = route(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireSession(); const { id } = await ctx.params; const body = await jsonBody<Record<string, unknown>>(request);
  return ok(await stakingService.submitIntent(session, id, requireString(body.signedTransactionBase64, 'signedTransactionBase64', 100_000)));
});
