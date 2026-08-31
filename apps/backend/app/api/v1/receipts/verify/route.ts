import { ok,route } from '@/lib/server/http';import { verifyReceiptChain } from '@/lib/server/receipts';import { requireSession } from '@/lib/server/session';
export const runtime='nodejs';export const GET=route(async()=>{await requireSession();return ok(await verifyReceiptChain());});
