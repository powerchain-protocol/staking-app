import { ok, route } from '@/lib/server/http'; import { requireSession } from '@/lib/server/session'; import { governanceService } from '@/services/governance.service';
export const runtime='nodejs';
export const POST=route(async(_r:Request,ctx:{params:Promise<{id:string}>})=>{const s=await requireSession();const {id}=await ctx.params;return ok(await governanceService.prepareIntent(s,id));});
