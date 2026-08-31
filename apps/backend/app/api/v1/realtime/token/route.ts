import { REALTIME_PROTOCOL } from '@powerchain/contracts';
import { requirePlatformIdentity } from '@/lib/auth/identity';
import { env } from '@/lib/server/config';
import { ApiError, ok, route } from '@/lib/server/http';
import { enforceRateLimit, rateLimitKey } from '@/lib/server/rate-limit';
import { issueRealtimeToken } from '@/lib/realtime/token';

export const runtime='nodejs';export const dynamic='force-dynamic';
export const POST=route(async(request:Request)=>{
  if(!env.realtimeEnabled)throw new ApiError(503,'REALTIME_DISABLED','Realtime transport is disabled');
  const identity=await requirePlatformIdentity(request);
  await enforceRateLimit(rateLimitKey('realtime-token',identity.subjectId),30,60);
  const issued=await issueRealtimeToken(identity.subjectId);
  return ok({
    token:issued.token,
    protocol:REALTIME_PROTOCOL,
    websocketUrl:env.realtimePublicUrl,
    expiresAt:new Date(issued.claims.exp*1000).toISOString(),
    heartbeatSeconds:env.realtimeHeartbeatSeconds,
    maxSubscriptions:env.realtimeMaxSubscriptions,
  });
});
