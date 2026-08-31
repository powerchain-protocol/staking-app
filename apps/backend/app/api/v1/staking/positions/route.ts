import { ok,route } from '@/lib/server/http';import { requireSession } from '@/lib/server/session';import { stakingService } from '@/services/staking.service';
export const runtime='nodejs';export const GET=route(async()=>{const session=await requireSession();return ok({positions:await stakingService.listPositions(session)});});
