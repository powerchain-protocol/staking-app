import { ok, route } from '@/lib/server/http';
import { requireSession } from '@/lib/server/session';
import { getGovernanceIntent } from '@/lib/server/governance';
import { reconcileGovernanceIntentById } from '@/lib/server/reconciliation';
export const runtime = 'nodejs';
export const GET = route(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireSession(); const { id } = await ctx.params;
  await reconcileGovernanceIntentById(id).catch(() => null);
  return ok(await getGovernanceIntent(session, id));
});
