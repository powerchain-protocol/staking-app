import { jsonBody,ok,requireString,route } from '@/lib/server/http'; import { requireSession } from '@/lib/server/session'; import { governanceService } from '@/services/governance.service';
export const runtime='nodejs';
export const POST=route(async(r:Request,ctx:{params:Promise<{id:string}>})=>{const s=await requireSession();const {id}=await ctx.params;const b=await jsonBody<Record<string,unknown>>(r);return ok(await governanceService.submitIntent(s,id,requireString(b.signedTransactionBase64,'signedTransactionBase64',100000)));});
