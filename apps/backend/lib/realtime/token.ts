import 'server-only';
import crypto from 'node:crypto';
import { env, ConfigurationError } from '@/lib/server/config';
import { db } from '@/lib/server/db';
import { ApiError } from '@/lib/server/http';

export type RealtimeTokenClaims = { iss:'powerchain';aud:'realtime';sub:string;jti:string;iat:number;exp:number;v:1 };
const b64=(value:Buffer|string)=>Buffer.from(value).toString('base64url');
function secret(){const value=env.realtimeSigningSecret||env.sessionSecret;if(value.length<32)throw new ConfigurationError('REALTIME_SIGNING_SECRET or SESSION_SECRET must be at least 32 characters');return value;}
function signature(body:string){return crypto.createHmac('sha256',secret()).update(body).digest('base64url');}

export async function issueRealtimeToken(subjectId:string){
  const now=Math.floor(Date.now()/1000);const jti=crypto.randomUUID();const claims:RealtimeTokenClaims={iss:'powerchain',aud:'realtime',sub:subjectId,jti,iat:now,exp:now+env.realtimeTokenTtlSeconds,v:1};
  const body=b64(JSON.stringify(claims));const token=`${body}.${signature(body)}`;
  await db()`INSERT INTO realtime_access_tokens(jti,subject_id,expires_at) VALUES(${jti}::uuid,${subjectId},to_timestamp(${claims.exp}))`;
  return{token,claims};
}

export function verifyRealtimeToken(token:string):RealtimeTokenClaims{
  const [body,sig,extra]=token.split('.');if(!body||!sig||extra)throw new ApiError(401,'REALTIME_TOKEN_INVALID','Realtime access token is invalid');
  const expected=signature(body);const a=Buffer.from(sig);const b=Buffer.from(expected);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw new ApiError(401,'REALTIME_TOKEN_INVALID','Realtime access token signature is invalid');
  let claims:RealtimeTokenClaims;try{claims=JSON.parse(Buffer.from(body,'base64url').toString('utf8'))}catch{throw new ApiError(401,'REALTIME_TOKEN_INVALID','Realtime access token payload is invalid')}
  const now=Math.floor(Date.now()/1000);if(claims.iss!=='powerchain'||claims.aud!=='realtime'||claims.v!==1||!claims.sub||!claims.jti||claims.exp<=now)throw new ApiError(401,'REALTIME_TOKEN_EXPIRED','Realtime access token is expired or invalid');
  return claims;
}

export async function consumeRealtimeToken(claims:RealtimeTokenClaims){
  const rows=await db()`UPDATE realtime_access_tokens SET consumed_at=now() WHERE jti=${claims.jti}::uuid AND subject_id=${claims.sub} AND consumed_at IS NULL AND expires_at>now() RETURNING jti`;
  if(!rows[0])throw new ApiError(401,'REALTIME_TOKEN_REPLAYED','Realtime access token is expired, consumed, or invalid');
}
