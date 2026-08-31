import { requireSession } from '@/lib/server/session';
import { db } from '@/lib/server/db';
import { ok, route } from '@/lib/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=route(async()=>{const s=await requireSession();return ok({wallets:await db()`SELECT id,wallet_address,network,wallet_kind,provider,is_primary,verified_at,created_at FROM wallet_links WHERE subject_id=${s.sub} ORDER BY is_primary DESC,created_at`});});
