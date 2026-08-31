import { verifyEmbeddedProviderSession } from '@/lib/server/embedded-wallet';
import { db } from '@/lib/server/db';
import { jsonBody,ok,requireString,route,ApiError } from '@/lib/server/http';
import { setSessionCookie } from '@/lib/server/session';
export const runtime='nodejs';

export const POST=route(async(r:Request)=>{
  const b=await jsonBody<Record<string,unknown>>(r);
  const enrollmentId=requireString(b.enrollmentId,'enrollmentId',64);
  const sessionToken=requireString(b.sessionToken,'sessionToken',4096);
  const [initial]=await db()`SELECT * FROM embedded_wallet_enrollments WHERE id=${enrollmentId} LIMIT 1`;
  if(!initial)throw new ApiError(404,'ENROLLMENT_NOT_FOUND','Embedded-wallet enrollment not found');
  if(initial.status==='COMPLETED')throw new ApiError(409,'ENROLLMENT_COMPLETED','Embedded-wallet enrollment is already complete');
  if(new Date(initial.expires_at)<=new Date())throw new ApiError(410,'ENROLLMENT_EXPIRED','Embedded-wallet enrollment expired');
  const verified=await verifyEmbeddedProviderSession(sessionToken);
  if(verified.subjectId!==initial.subject_id)throw new ApiError(403,'EMBEDDED_SUBJECT_MISMATCH','Embedded-wallet completion does not match enrollment');
  const network=String(verified.network).toUpperCase() as 'SOLANA'|'SUI';
  if(network!==initial.network)throw new ApiError(403,'EMBEDDED_NETWORK_MISMATCH','Embedded-wallet network does not match enrollment');
  const wallet=String(verified.walletAddress);
  let resolvedSubject=String(initial.subject_id);
  await db().begin(async(tx)=>{
    const [enrollment]=await tx`SELECT * FROM embedded_wallet_enrollments WHERE id=${enrollmentId} FOR UPDATE`;
    if(!enrollment||enrollment.status==='COMPLETED')throw new ApiError(409,'ENROLLMENT_COMPLETED','Embedded-wallet enrollment is already complete');
    if(new Date(enrollment.expires_at)<=new Date())throw new ApiError(410,'ENROLLMENT_EXPIRED','Embedded-wallet enrollment expired');
    const [existing]=await tx`SELECT * FROM wallet_links WHERE network=${network} AND wallet_address=${wallet} FOR UPDATE`;
    resolvedSubject=existing?.subject_id ? String(existing.subject_id) : String(enrollment.subject_id);
    await tx`
      INSERT INTO wallet_links(subject_id,wallet_address,network,wallet_kind,provider,provider_wallet_id,provider_subject_id,is_primary)
      VALUES(${resolvedSubject},${wallet},${network},'EMBEDDED',${String(verified.provider??'embedded-provider')},${String(verified.providerWalletId??'')},${String(enrollment.subject_id)},true)
      ON CONFLICT(network,wallet_address) DO UPDATE SET
        wallet_kind='EMBEDDED', provider=EXCLUDED.provider, provider_wallet_id=EXCLUDED.provider_wallet_id,
        provider_subject_id=EXCLUDED.provider_subject_id, verified_at=now()
    `;
    await tx`UPDATE embedded_wallet_enrollments SET status='COMPLETED',completed_at=now() WHERE id=${enrollmentId}`;
  });
  await setSessionCookie({sub:resolvedSubject,wallet,network,kind:'EMBEDDED'});
  return ok({authenticated:true,wallet,network,kind:'EMBEDDED'});
});
