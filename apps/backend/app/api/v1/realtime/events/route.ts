import { requirePlatformIdentity } from '@/lib/auth/identity';
import { env } from '@/lib/server/config';
import { ApiError, ok, route } from '@/lib/server/http';
import { realtimeEvents } from '@/lib/realtime/events';
import { requireRealtimeTopics } from '@/lib/realtime/topics';

export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=route(async(request:Request)=>{
  if(!env.realtimeEnabled)throw new ApiError(503,'REALTIME_DISABLED','Realtime transport is disabled');
  const identity=await requirePlatformIdentity(request);const url=new URL(request.url);
  const topics=requireRealtimeTopics(url.searchParams.get('topics')??'',env.realtimeMaxSubscriptions);
  const afterEventId=url.searchParams.get('after');
  return ok(await realtimeEvents({subjectId:identity.subjectId,topics,afterEventId,limit:200}));
});
