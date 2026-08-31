import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { Client } from 'pg';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { REALTIME_PROTOCOL, REALTIME_TOPICS, type RealtimeClientMessage, type RealtimeEventEnvelope, type RealtimeServerMessage, type RealtimeTopic } from '@powerchain/contracts';
import { env } from '../lib/server/config';
import { verifyRealtimeToken } from '../lib/realtime/token';

const instanceId=`realtime:${process.env.HOSTNAME??'local'}:${process.pid}:${crypto.randomUUID()}`;
const startedAt=new Date();
const allowedTopics=new Set<string>(REALTIME_TOPICS);
const clients=new Map<WebSocket,{subjectId:string;connectionId:string;topics:Set<RealtimeTopic>;alive:boolean;windowStarted:number;messages:number}>();
const subjectCounts=new Map<string,number>();
let eventCursor=0n;
let listener:Client|null=null;
let shuttingDown=false;
let lastDatabaseHeartbeatAt=0;

type Claims={sub:string;jti:string;exp:number};
function send(ws:WebSocket,message:RealtimeServerMessage){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(message));}
function parseToken(req:import('node:http').IncomingMessage){const parts=String(req.headers['sec-websocket-protocol']??'').split(',').map(x=>x.trim());const value=parts.find(x=>x.startsWith('bearer.'));return value?.slice('bearer.'.length)??'';}
function originAllowed(origin:string|undefined){
  const allowed=[env.appOrigin,...env.apiCorsOrigins].map((x)=>{try{return new URL(x).origin}catch{return''}}).filter(Boolean);
  if(!origin)return env.nodeEnv!=='production';
  try{return allowed.includes(new URL(origin).origin)}catch{return false}
}
function parseClientMessage(raw:RawData):RealtimeClientMessage|null{
  const bytes=Buffer.isBuffer(raw)?raw:Buffer.from(raw as any);if(bytes.byteLength>env.realtimeMaxPayloadBytes)return null;
  try{const parsed=JSON.parse(bytes.toString('utf8'));if(!parsed||typeof parsed!=='object'||typeof parsed.type!=='string')return null;return parsed as RealtimeClientMessage}catch{return null}
}
function topicsFrom(value:unknown){const values=Array.isArray(value)?value:[];return [...new Set(values.map(String).filter((x)=>allowedTopics.has(x)))].slice(0,env.realtimeMaxSubscriptions) as RealtimeTopic[];}
async function consumeToken(client:Client,claims:Claims){
  const result=await client.query(`UPDATE realtime_access_tokens SET consumed_at=now() WHERE jti=$1::uuid AND subject_id=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING jti`,[claims.jti,claims.sub]);
  return result.rowCount===1;
}
async function catchup(client:Client,subjectId:string,topics:RealtimeTopic[],afterEventId:string|undefined,limit=200){
  const after=/^\d+$/.test(afterEventId??'')?afterEventId:'0';
  const result=await client.query(`SELECT event_id,topic,event_type,subject_id,entity_type,entity_id,payload,created_at FROM realtime_events WHERE event_id>$1::bigint AND topic=ANY($2::text[]) AND (subject_id IS NULL OR subject_id=$3) ORDER BY event_id ASC LIMIT $4`,[after,topics,subjectId,limit]);
  return result.rows;
}
function envelope(row:any):RealtimeEventEnvelope{return{eventId:String(row.event_id),topic:String(row.topic) as RealtimeTopic,eventType:String(row.event_type),entityType:row.entity_type??null,entityId:row.entity_id??null,subjectScoped:Boolean(row.subject_id),payload:row.payload??{},createdAt:new Date(row.created_at).toISOString()};}
async function broadcastEvent(client:Client,eventId:string){
  if(!/^\d+$/.test(eventId))return;const result=await client.query(`SELECT event_id,topic,event_type,subject_id,entity_type,entity_id,payload,created_at FROM realtime_events WHERE event_id=$1::bigint LIMIT 1`,[eventId]);const row=result.rows[0];if(!row)return;
  eventCursor=BigInt(String(row.event_id));const event=envelope(row);
  for(const[ws,meta]of clients){if(ws.readyState!==WebSocket.OPEN||!meta.topics.has(event.topic))continue;if(row.subject_id&&String(row.subject_id)!==meta.subjectId)continue;send(ws,{type:'event',event});}
}
async function heartbeat(client:Client){
  await client.query(`INSERT INTO realtime_server_heartbeats(instance_id,started_at,last_seen_at,connections,event_cursor) VALUES($1,$2,now(),$3,$4) ON CONFLICT(instance_id) DO UPDATE SET last_seen_at=now(),connections=excluded.connections,event_cursor=excluded.event_cursor`,[instanceId,startedAt,clients.size,eventCursor.toString()]);
  lastDatabaseHeartbeatAt=Date.now();
}
async function cleanupRetention(client:Client){
  await client.query(`DELETE FROM realtime_access_tokens WHERE expires_at < now()-interval '1 hour'`);
  await client.query(`DELETE FROM realtime_events WHERE created_at < now()-($1||' hours')::interval`,[String(env.realtimeEventRetentionHours)]);
}
async function connectListener(){
  const client=new Client({connectionString:env.databaseUrl,application_name:'powerchain-realtime'});await client.connect();await client.query('LISTEN powerchain_realtime');
  client.on('notification',(msg)=>{if(msg.channel==='powerchain_realtime'&&msg.payload)void broadcastEvent(client,msg.payload).catch((e)=>console.error(JSON.stringify({event:'realtime_broadcast_failed',error:e instanceof Error?e.message:String(e)})));});
  client.on('error',(e)=>{console.error(JSON.stringify({event:'realtime_listener_error',error:e.message}));if(!shuttingDown)setTimeout(()=>void reconnectListener(),1000).unref();});
  return client;
}
async function reconnectListener(){try{await listener?.end().catch(()=>{});listener=await connectListener();}catch(e){console.error(JSON.stringify({event:'realtime_listener_reconnect_failed',error:e instanceof Error?e.message:String(e)}));if(!shuttingDown)setTimeout(()=>void reconnectListener(),2000).unref();}}

if(!env.realtimeEnabled)throw new Error('REALTIME_ENABLED is false');
if(!env.databaseUrl)throw new Error('DATABASE_URL is required for realtime transport');
listener=await connectListener();
const authClient=new Client({connectionString:env.databaseUrl,application_name:'powerchain-realtime-auth'});await authClient.connect();

const httpServer=createServer((req,res)=>{const path=(req.url??'/').split('?')[0];if(path==='/healthz'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:true,service:'powerchain-realtime',version:'1.0.0'}));return;}if(path==='/readyz'){const heartbeatAgeMs=lastDatabaseHeartbeatAt?Date.now()-lastDatabaseHeartbeatAt:Number.POSITIVE_INFINITY;const ready=Boolean(listener)&&!shuttingDown&&heartbeatAgeMs<=env.realtimeHeartbeatSeconds*3000;res.writeHead(ready?200:503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:ready,service:'powerchain-realtime',connections:clients.size,eventCursor:eventCursor.toString(),databaseHeartbeatAgeSeconds:Number.isFinite(heartbeatAgeMs)?Math.floor(heartbeatAgeMs/1000):null}));return;}res.writeHead(404,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'NOT_FOUND'}));});
const wss=new WebSocketServer({
  server:httpServer,maxPayload:env.realtimeMaxPayloadBytes,
  handleProtocols(protocols){return protocols.has(REALTIME_PROTOCOL)?REALTIME_PROTOCOL:false;},
  verifyClient(info,done){
    if(!originAllowed(info.origin)){done(false,403,'Origin not allowed');return;}
    const token=parseToken(info.req);if(!token){done(false,401,'Realtime token required');return;}
    try{
      const claims=verifyRealtimeToken(token) as Claims;
      if((subjectCounts.get(claims.sub)??0)>=env.realtimeMaxConnectionsPerSubject){done(false,429,'Connection limit exceeded');return;}
      void consumeToken(authClient,claims).then((ok)=>{if(!ok){done(false,401,'Realtime token already used');return;}(info.req as any).powerchainClaims=claims;done(true);}).catch(()=>done(false,401,'Realtime token rejected'));
    }catch{done(false,401,'Realtime token rejected');}
  },
});

await new Promise<void>((resolve,reject)=>{const onError=(error:Error)=>{httpServer.off('listening',onListening);reject(error)};const onListening=()=>{httpServer.off('error',onError);resolve()};httpServer.once('error',onError);httpServer.once('listening',onListening);httpServer.listen(env.realtimePort,env.realtimeHost);});

wss.on('connection',(ws,req)=>{
  const claims=(req as any).powerchainClaims as Claims|undefined;if(!claims){ws.close(4401,'Unauthorized');return;}
  const connectionId=crypto.randomUUID();const meta={subjectId:claims.sub,connectionId,topics:new Set<RealtimeTopic>(),alive:true,windowStarted:Date.now(),messages:0};clients.set(ws,meta);subjectCounts.set(claims.sub,(subjectCounts.get(claims.sub)??0)+1);
  ws.on('pong',()=>{meta.alive=true;});
  ws.on('message',(raw)=>{
    const now=Date.now();if(now-meta.windowStarted>=60_000){meta.windowStarted=now;meta.messages=0;}meta.messages+=1;if(meta.messages>env.realtimeMaxMessagesPerMinute){send(ws,{type:'error',code:'REALTIME_RATE_LIMIT',message:'Realtime message rate exceeded',retryable:false});ws.close(4429,'Rate limit');return;}
    const message=parseClientMessage(raw);if(!message){send(ws,{type:'error',code:'REALTIME_MESSAGE_INVALID',message:'Realtime message is invalid or too large',retryable:false});return;}
    if(message.type==='ping'){send(ws,{type:'pong',nonce:message.nonce,at:new Date().toISOString()});return;}
    if(message.type==='unsubscribe'){for(const topic of topicsFrom(message.topics))meta.topics.delete(topic);send(ws,{type:'unsubscribed',topics:[...meta.topics]});return;}
    if(message.type==='subscribe'){
      const requested=topicsFrom(message.topics);if(!requested.length){send(ws,{type:'error',code:'REALTIME_TOPICS_REQUIRED',message:'At least one supported topic is required',retryable:true});return;}
      for(const topic of requested)meta.topics.add(topic);if(meta.topics.size>env.realtimeMaxSubscriptions){send(ws,{type:'error',code:'REALTIME_SUBSCRIPTION_LIMIT',message:'Realtime subscription limit exceeded',retryable:true});return;}
      send(ws,{type:'subscribed',topics:[...meta.topics]});
      if(message.afterEventId&&listener)void catchup(listener,meta.subjectId,[...meta.topics],message.afterEventId).then((rows)=>{for(const row of rows)send(ws,{type:'event',event:envelope(row)});}).catch(()=>send(ws,{type:'error',code:'REALTIME_CATCHUP_FAILED',message:'Realtime catch-up failed; refresh authoritative API state',retryable:true}));
    }
  });
  ws.on('close',()=>{clients.delete(ws);const count=Math.max(0,(subjectCounts.get(claims.sub)??1)-1);if(count)subjectCounts.set(claims.sub,count);else subjectCounts.delete(claims.sub);});
  send(ws,{type:'ready',connectionId,protocol:REALTIME_PROTOCOL,heartbeatSeconds:env.realtimeHeartbeatSeconds,maxSubscriptions:env.realtimeMaxSubscriptions});
});

const heartbeatTimer=setInterval(()=>{for(const[ws,meta]of clients){if(!meta.alive){ws.terminate();continue;}meta.alive=false;ws.ping();send(ws,{type:'heartbeat',at:new Date().toISOString()});}if(listener)void heartbeat(listener).catch((error)=>console.error(JSON.stringify({event:'realtime_heartbeat_failed',error:error instanceof Error?error.message:String(error)})));},env.realtimeHeartbeatSeconds*1000);heartbeatTimer.unref();
const retentionTimer=setInterval(()=>{if(listener)void cleanupRetention(listener).catch((error)=>console.error(JSON.stringify({event:'realtime_retention_failed',error:error instanceof Error?error.message:String(error)})));},60*60*1000);retentionTimer.unref();
await heartbeat(authClient);
await cleanupRetention(authClient).catch(()=>{});
console.info(JSON.stringify({event:'powerchain_realtime_started',instanceId,host:env.realtimeHost,port:env.realtimePort,protocol:REALTIME_PROTOCOL}));

async function shutdown(signal:string){if(shuttingDown)return;shuttingDown=true;console.info(JSON.stringify({event:'powerchain_realtime_stopping',signal}));clearInterval(heartbeatTimer);clearInterval(retentionTimer);for(const ws of clients.keys())ws.close(1001,'Server shutdown');await new Promise<void>((resolve)=>wss.close(()=>resolve()));await new Promise<void>((resolve)=>httpServer.close(()=>resolve()));await listener?.end().catch(()=>{});await authClient.end().catch(()=>{});process.exit(0);}
process.on('SIGTERM',()=>void shutdown('SIGTERM'));process.on('SIGINT',()=>void shutdown('SIGINT'));
