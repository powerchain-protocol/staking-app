import { ok,route } from '@/lib/server/http';import { requireSession } from '@/lib/server/session';import { getWalletTransferIntent } from '@/lib/server/transfers';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=route(async(_request:Request,ctx:{params:Promise<{id:string}>})=>{const session=await requireSession();const{id}=await ctx.params;return ok(await getWalletTransferIntent(session,id));});
