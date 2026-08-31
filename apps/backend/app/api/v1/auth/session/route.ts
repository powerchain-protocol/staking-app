import { getSession } from '@/lib/server/session';
import { ok, route } from '@/lib/server/http';
import { getPlatformIdentity } from '@/lib/auth/identity';
import { env } from '@/lib/server/config';

export const GET = route(async (request: Request) => {
  const identity = env.requirePrimaryIdentity ? await getPlatformIdentity(request) : null;
  const session = await getSession();
  if (!session || (env.requirePrimaryIdentity && (!identity || identity.subjectId !== session.sub))) return ok({ session: null, identity });
  return ok({
    identity,
    session: {
      subject: session.sub,
      wallet: session.wallet,
      network: session.network,
      kind: session.kind,
      issuedAt: new Date(session.iat * 1000).toISOString(),
      expiresAt: new Date(session.exp * 1000).toISOString(),
    },
  });
});
