import { verifyEmbeddedProviderSession } from '@/lib/server/embedded-wallet';
import { jsonBody,ok,requireString,route,ApiError } from '@/lib/server/http';
import { requireSession } from '@/lib/server/session';
import { db } from '@/lib/server/db';
export const runtime='nodejs';
export const POST=route(async(r:Request)=>{
  const s=await requireSession();
  if(s.kind!=='EMBEDDED')throw new ApiError(409,'EMBEDDED_WALLET_REQUIRED','Current session is not an embedded wallet');
  const b=await jsonBody<Record<string,unknown>>(r);
  const verified=await verifyEmbeddedProviderSession(requireString(b.sessionToken,'sessionToken',4096));
  const [link]=await db()`SELECT provider_subject_id FROM wallet_links WHERE subject_id=${s.sub} AND network=${s.network} AND wallet_address=${s.wallet} AND wallet_kind='EMBEDDED' LIMIT 1`;
  const expectedProviderSubject=String(link?.provider_subject_id??s.sub);
  if(verified.subjectId!==expectedProviderSubject||verified.walletAddress!==s.wallet)throw new ApiError(403,'EMBEDDED_SESSION_MISMATCH','Signing session does not match authenticated embedded wallet');
  if(String(verified.network).toUpperCase()!==s.network)throw new ApiError(403,'EMBEDDED_NETWORK_MISMATCH','Signing session network does not match authenticated embedded wallet');
  if(typeof verified.signedPayload!=='string')throw new ApiError(502,'SIGNED_PAYLOAD_MISSING','Embedded-wallet provider did not return a signed payload');
  return ok({signedPayload:verified.signedPayload,network:s.network,wallet:s.wallet});
});
