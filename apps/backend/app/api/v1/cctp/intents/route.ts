import { atomicString, jsonBody, ok, requireString, route } from '@/lib/server/http';
import { requireSession } from '@/lib/server/session';
import { createCctpIntent, listCctpIntents } from '@/lib/integrations/cctp-intents';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export const GET=route(async()=>{const s=await requireSession();return ok({intents:await listCctpIntents(s)});});
export const POST=route(async(request:Request)=>{const b=await jsonBody<Record<string,unknown>>(request);const amount=atomicString(b.amountAtomic,'amountAtomic').toString();const recipient=requireString(b.recipient,'recipient',256);const transferMode=b.transferMode==='FAST'?'FAST':'STANDARD';const destinationDomain=b.destinationDomain==null?undefined:Number(b.destinationDomain);return ok(await createCctpIntent(request,{amountAtomic:amount,recipient,transferMode,destinationDomain}),{status:201});});
