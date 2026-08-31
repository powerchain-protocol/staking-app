import { createEmbeddedSigningSession } from '@/lib/server/embedded-wallet';
import { jsonBody, ok, requireString, route, ApiError } from '@/lib/server/http';
import { requireSession } from '@/lib/server/session';
import { env } from '@/lib/server/config';
import { db } from '@/lib/server/db';

export const runtime = 'nodejs';
export const POST = route(async (request: Request) => {
  const session = await requireSession();
  if (session.kind !== 'EMBEDDED') throw new ApiError(409, 'EMBEDDED_WALLET_REQUIRED', 'Current session is not an embedded wallet');
  const body = await jsonBody<Record<string, unknown>>(request);
  const operation = requireString(body.operation, 'operation', 32) as 'CREATE_WALLET' | 'SIGN_MESSAGE' | 'SIGN_TRANSACTION';
  if (!['SIGN_MESSAGE','SIGN_TRANSACTION'].includes(operation)) throw new ApiError(400, 'INVALID_OPERATION', 'Authenticated embedded wallets may only request signing sessions');
  const [link] = await db()`SELECT provider_subject_id FROM wallet_links WHERE subject_id=${session.sub} AND network=${session.network} AND wallet_address=${session.wallet} AND wallet_kind='EMBEDDED' LIMIT 1`;
  const providerSubjectId = String(link?.provider_subject_id ?? session.sub);
  const data = await createEmbeddedSigningSession({
    operation,
    subjectId: providerSubjectId,
    network: session.network,
    walletAddress: session.wallet,
    payload: typeof body.payload === 'string' ? body.payload : null,
    returnUrl: typeof body.returnUrl === 'string' ? body.returnUrl : `${env.appOrigin}/`,
  });
  return ok(data);
});
