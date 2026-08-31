import { ok,route } from '@/lib/server/http';import { requireSession } from '@/lib/server/session';import { bondsService } from '@/services/bonds.service';
export const runtime='nodejs';export const POST=route(async(_r:Request,c:{params:Promise<{id:string}>})=>{const s=await requireSession();const{id}=await c.params;return ok(await bondsService.prepareIntent(s,id));});
