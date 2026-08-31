import { atomicString, jsonBody, ok, requireString, route } from '@/lib/server/http';
import { requireSession } from '@/lib/server/session';
import { createWalletTransferIntent, listWalletTransfers } from '@/lib/server/transfers';
import { enforceRateLimit, rateLimitKey } from '@/lib/server/rate-limit';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=route(async()=>{const session=await requireSession();return ok({transfers:await listWalletTransfers(session)});});
export const POST=route(async(request:Request)=>{const session=await requireSession();await enforceRateLimit(rateLimitKey('wallet-transfer',session.sub),20,60);const body=await jsonBody<Record<string,unknown>>(request);const idempotencyKey=requireString(request.headers.get('idempotency-key')??body.idempotencyKey??'','idempotencyKey',128);const result=await createWalletTransferIntent(session,{destination:requireString(body.destination,'destination',64),amountAtomic:atomicString(body.amountAtomic,'amountAtomic'),idempotencyKey});return ok(result,{status:201});});
