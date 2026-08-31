import { ok,route } from '@/lib/server/http';import { requireSession } from '@/lib/server/session';import { bondsService } from '@/services/bonds.service';
export const runtime='nodejs';export const GET=route(async()=>{const s=await requireSession();return ok({bonds:await bondsService.list(s)});});
