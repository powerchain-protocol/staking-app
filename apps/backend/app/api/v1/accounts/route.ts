import { requireSession } from '@/lib/server/session';
import { db } from '@/lib/server/db';
import { ok, route } from '@/lib/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=route(async()=>{const s=await requireSession();const [user]=await db()`SELECT id,status,primary_wallet,primary_network,created_at,updated_at FROM users WHERE id=${s.sub}`;const links=await db()`SELECT id,wallet_address,network,wallet_kind,is_primary,verified_at FROM wallet_links WHERE subject_id=${s.sub} ORDER BY is_primary DESC,created_at`;return ok({account:user??null,wallets:links});});
