import 'server-only';
import type { RealtimeEventEnvelope, RealtimeTopic } from '@powerchain/contracts';
import { db } from '@/lib/server/db';

function envelope(row:Record<string,any>):RealtimeEventEnvelope{return{
  eventId:String(row.event_id),topic:String(row.topic) as RealtimeTopic,eventType:String(row.event_type),
  entityType:row.entity_type??null,entityId:row.entity_id??null,subjectScoped:Boolean(row.subject_id),payload:(row.payload??{}) as Record<string,unknown>,createdAt:new Date(row.created_at).toISOString(),
};}

export async function realtimeEvents(input:{subjectId:string;topics:RealtimeTopic[];afterEventId?:string|null;limit?:number}){
  const after=/^\d+$/.test(String(input.afterEventId??''))?BigInt(String(input.afterEventId)):0n;const limit=Math.max(1,Math.min(input.limit??200,500));
  const rows=await db()`SELECT event_id,topic,event_type,subject_id,entity_type,entity_id,payload,created_at FROM realtime_events
    WHERE event_id>${after.toString()}::bigint AND topic=ANY(${input.topics}::text[]) AND (subject_id IS NULL OR subject_id=${input.subjectId})
    ORDER BY event_id ASC LIMIT ${limit}`;
  const events=(rows as Array<Record<string,any>>).map(envelope);return{events,cursor:events.at(-1)?.eventId??(after>0n?after.toString():null)};
}

export async function realtimeEventById(eventId:string){
  if(!/^\d+$/.test(eventId))return null;const[row]=await db()`SELECT event_id,topic,event_type,subject_id,entity_type,entity_id,payload,created_at FROM realtime_events WHERE event_id=${eventId}::bigint LIMIT 1`;
  return row?{raw:row as Record<string,any>,event:envelope(row as Record<string,any>)}:null;
}

export async function cleanupRealtimeData(){
  await db()`DELETE FROM realtime_access_tokens WHERE expires_at<now()-interval '1 hour'`;
  await db()`DELETE FROM realtime_events WHERE created_at<now()-(${String(Math.max(1,Math.min(168,Number(process.env.REALTIME_EVENT_RETENTION_HOURS??24))))}||' hours')::interval`;
}
