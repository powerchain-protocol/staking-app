import { db } from '@/lib/server/db';
import { ok, route } from '@/lib/server/http';
import { requireAdminSession } from '@/lib/server/controls';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export const GET=route(async()=>{await requireAdminSession();const alerts=await db()`SELECT id,alert_type,severity,message,details,first_seen_at,last_seen_at,resolved_at FROM operational_alerts ORDER BY resolved_at NULLS FIRST,severity DESC,last_seen_at DESC LIMIT 200`;return ok({alerts});});
