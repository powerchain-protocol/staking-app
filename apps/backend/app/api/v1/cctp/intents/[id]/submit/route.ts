import { jsonBody, ok, requireString, route } from '@/lib/server/http'; import { requireSession } from '@/lib/server/session'; import { submitCctpIntent } from '@/lib/integrations/cctp-intents';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export const POST=route(async(r:Request,{params}:{params:Promise<{id:string}>})=>{const s=await requireSession();const b=await jsonBody<Record<string,unknown>>(r);const {id}=await params;return ok(await submitCctpIntent(s,id,requireString(b.signedTransactionBase64,'signedTransactionBase64',200000)));});
