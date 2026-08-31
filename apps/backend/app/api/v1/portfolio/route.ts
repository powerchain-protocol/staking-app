import { requireSession } from '@/lib/server/session';import { ok,route } from '@/lib/server/http';import { portfolioService } from '@/services/portfolio.service';
export const runtime='nodejs';export const dynamic='force-dynamic';export const GET=route(async()=>{const s=await requireSession();return ok({portfolio:await portfolioService.snapshot(s.sub)});});
