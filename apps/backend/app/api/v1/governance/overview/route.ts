import { ok,route } from '@/lib/server/http';import { requireSession } from '@/lib/server/session';import { governanceService } from '@/services/governance.service';
export const runtime='nodejs';export const GET=route(async()=>{const session=await requireSession();return ok(await governanceService.overview(session.sub));});
