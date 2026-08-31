import { db } from '@/lib/server/db';
import { ApiError, ok, route } from '@/lib/server/http';
import { requireAdminSession } from '@/lib/server/controls';
import { requestContext } from '@/lib/server/request-context';
export const runtime='nodejs'; export const dynamic='force-dynamic';

const TABLE: Record<string,string> = {
  STAKING_INTENT:'staking_intents', GOVERNANCE_INTENT:'governance_intents', BOND_INTENT:'service_bond_intents', WALLET_TRANSFER_INTENT:'wallet_transfer_intents',
};

export const POST=route(async(_r:Request,{params}:{params:Promise<{id:string}>})=>{
  const session=await requireAdminSession();
  const {id}=await params;
  const result=await db().begin(async(tx)=>{
    const rows=await tx`SELECT * FROM reconciliation_exceptions WHERE id=${id}::uuid AND resolved_at IS NULL FOR UPDATE`;
    const exception=rows[0] as Record<string,any>|undefined;
    if(!exception)throw new ApiError(404,'EXCEPTION_NOT_FOUND','Open reconciliation exception was not found');
    const table=TABLE[String(exception.source_type)];
    if(!table)throw new ApiError(409,'EXCEPTION_NOT_REQUEUEABLE','This exception type is resolved by the worker/readiness verifier rather than an intent requeue');
    if(['FAILED','TRANSACTION_FAILED'].includes(String(exception.code)))throw new ApiError(409,'FAILED_TRANSACTION_NOT_REQUEUEABLE','A transaction that finalized as failed must not be requeued. Create a new intent after review.');
    const intents=await tx.unsafe(`SELECT id,status,submitted_signature FROM ${table} WHERE id=$1 FOR UPDATE`,[String(exception.source_id)]);
    const intent=intents[0] as Record<string,any>|undefined;
    if(!intent||!intent.submitted_signature)throw new ApiError(409,'INTENT_NOT_REQUEUEABLE','The source intent is missing or has no submitted chain signature');
    if(!['REQUIRES_REVIEW','CONFIRMING','SUBMITTED','RECONCILING'].includes(String(intent.status)))throw new ApiError(409,'INTENT_NOT_REQUEUEABLE',`Intent status ${intent.status} cannot be requeued`);
    await tx.unsafe(`UPDATE ${table} SET status='SUBMITTED',reconciliation_claimed_at=NULL,updated_at=now() WHERE id=$1`,[String(intent.id)]);
    await tx`UPDATE reconciliation_exceptions SET resolved_at=now(),resolution='REQUEUED_FOR_RECONCILIATION',retry_count=retry_count+1,last_retry_at=now(),last_retried_by=${session.wallet} WHERE id=${id}::uuid`;
    await tx`INSERT INTO security_events(event_type,severity,wallet_address,request_id,source,details) VALUES('RECONCILIATION_EXCEPTION_REQUEUED','WARNING',${session.wallet},${requestContext()?.requestId ?? null},'ADMIN_API',${tx.json({exceptionId:id,sourceType:exception.source_type,sourceId:exception.source_id,previousStatus:intent.status})})`;
    return {exceptionId:id,sourceType:exception.source_type,sourceId:exception.source_id,status:'SUBMITTED'};
  });
  return ok(result);
});
