import { db } from '@/lib/server/db';
import { ApiError, jsonBody, ok, route } from '@/lib/server/http';
import { requireAdminSession } from '@/lib/server/controls';
import { requestContext } from '@/lib/server/request-context';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export const POST=route(async(r:Request,{params}:{params:Promise<{id:string}>})=>{const s=await requireAdminSession();const {id}=await params;const body=await jsonBody<Record<string,unknown>>(r);const note=typeof body.note==='string'?body.note.slice(0,1000):'Resolved by administrator';const rows=await db()`UPDATE reconciliation_exceptions SET resolved_at=now(),resolution=${note} WHERE id=${id}::uuid AND resolved_at IS NULL RETURNING id,source_type,source_id,code,resolved_at`;if(!rows[0])throw new ApiError(404,'EXCEPTION_NOT_FOUND','Open reconciliation exception was not found');await db()`INSERT INTO security_events(event_type,severity,wallet_address,request_id,source,details) VALUES('RECONCILIATION_EXCEPTION_RESOLVED','INFO',${s.wallet},${requestContext()?.requestId ?? null},'ADMIN_API',${db().json({exceptionId:id,note})})`;return ok(rows[0]);});
