import { requireSession } from '@/lib/server/session';
import { ok, route } from '@/lib/server/http';
import { accountHistory } from '@/lib/histories';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=route(async(request:Request)=>{const s=await requireSession();const u=new URL(request.url);return ok({items:await accountHistory(s.sub,Number(u.searchParams.get('limit')??50))});});
