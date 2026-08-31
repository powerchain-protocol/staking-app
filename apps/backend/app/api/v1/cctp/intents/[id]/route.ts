import { ok, route } from '@/lib/server/http'; import { requireSession } from '@/lib/server/session'; import { refreshCctpIntent } from '@/lib/integrations/cctp-intents';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export const GET=route(async(_r:Request,{params}:{params:Promise<{id:string}>})=>{const s=await requireSession();const {id}=await params;return ok({intent:await refreshCctpIntent(s,id)});});
