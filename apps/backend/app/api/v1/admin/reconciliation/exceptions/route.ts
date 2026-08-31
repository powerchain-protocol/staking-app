import { db } from '@/lib/server/db';
import { ok, route } from '@/lib/server/http';
import { requireAdminSession } from '@/lib/server/controls';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export const GET=route(async()=>{await requireAdminSession();const rows=await db()`SELECT id,source_type,source_id,code,message,details,retry_count,last_retry_at,last_retried_by,created_at FROM reconciliation_exceptions WHERE resolved_at IS NULL ORDER BY created_at ASC LIMIT 250`;return ok({exceptions:rows});});
