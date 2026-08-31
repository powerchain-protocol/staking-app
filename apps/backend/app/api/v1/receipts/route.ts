import { ok,route } from '@/lib/server/http';import { requireSession } from '@/lib/server/session';import { db } from '@/lib/server/db';
export const runtime='nodejs';export const GET=route(async()=>{const s=await requireSession();return ok({receipts:await db()`SELECT * FROM immutable_receipts WHERE subject_id=${s.sub} ORDER BY created_at DESC LIMIT 200`});});
