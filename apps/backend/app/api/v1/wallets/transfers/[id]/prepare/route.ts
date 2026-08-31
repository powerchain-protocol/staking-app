import { ok,route } from '@/lib/server/http';import { requireSession } from '@/lib/server/session';import { prepareWalletTransferIntent } from '@/lib/server/transfers';
export const runtime='nodejs';
export const POST=route(async(_request:Request,ctx:{params:Promise<{id:string}>})=>{const session=await requireSession();const{id}=await ctx.params;return ok(await prepareWalletTransferIntent(session,id));});
