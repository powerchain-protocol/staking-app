import { ok, route } from '@/lib/server/http';
import { requireSession } from '@/lib/server/session';
import { stakingService } from '@/services/staking.service';
import { reconcileStakingIntentById } from '@/lib/server/reconciliation';
export const runtime = 'nodejs';
export const GET = route(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireSession(); const { id } = await ctx.params; await reconcileStakingIntentById(id); return ok(await stakingService.getIntent(session, id));
});
