import { ok,route } from '@/lib/server/http';import { requireSession } from '@/lib/server/session';import { rewardsService } from '@/services/rewards.service';
export const runtime='nodejs';export const GET=route(async()=>{const session=await requireSession();return ok(await rewardsService.overview(session));});
