import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { db } from '@/lib/server/db';
import { ApiError } from '@/lib/server/http';
import { randomToken, verifySolanaMessage } from '@/lib/server/crypto';
import { requireSession } from '@/lib/server/session';
import { requirePlatformIdentity } from './identity';
import { env } from '@/lib/server/config';

export function canonicalJson(value:unknown):string{
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
export function actionHash(value:unknown){return createHash('sha256').update(canonicalJson(value)).digest('hex')}
export function confirmationTokenHash(token:string){return createHash('sha256').update(token).digest('hex')}

export async function createActionConfirmation(request:Request,input:{action:string;payload:unknown}){
  const identity=await requirePlatformIdentity(request);const wallet=await requireSession();
  if(identity.subjectId!==wallet.sub)throw new ApiError(401,'IDENTITY_WALLET_SESSION_MISMATCH','Account session and wallet verification do not belong to the same subject');
  const hash=actionHash(input.payload);const nonce=randomToken(24);const expiresAt=new Date(Date.now()+env.actionConfirmationTtlSeconds*1000);
  const message=['PowerChain secure action confirmation',`Account: ${identity.subjectId}`,`Wallet: ${wallet.wallet}`,`Network: ${wallet.network}`,`Action: ${input.action}`,`Action Hash: ${hash}`,`Nonce: ${nonce}`,`Expires At: ${expiresAt.toISOString()}`,'Purpose: Confirm this exact off-chain privileged action. This does not replace a blockchain transaction signature.'].join('\n');
  const [row]=await db()`INSERT INTO action_confirmation_challenges(subject_id,wallet_address,network,action,action_hash,nonce,message,expires_at) VALUES(${identity.subjectId},${wallet.wallet},${wallet.network},${input.action},${hash},${nonce},${message},${expiresAt}) RETURNING id`;
  return {challengeId:row.id,message,action:input.action,actionHash:hash,expiresAt};
}

export async function verifyActionConfirmation(request:Request,input:{challengeId:string;signature:string}){
  const identity=await requirePlatformIdentity(request);const wallet=await requireSession();const sql=db();let token='';
  await sql.begin(async tx=>{const [c]=await tx`SELECT * FROM action_confirmation_challenges WHERE id=${input.challengeId}::uuid FOR UPDATE`;if(!c)throw new ApiError(404,'CONFIRMATION_CHALLENGE_NOT_FOUND','Confirmation challenge not found');if(c.consumed_at)throw new ApiError(409,'CONFIRMATION_CHALLENGE_CONSUMED','Confirmation challenge was already used');if(new Date(c.expires_at)<=new Date())throw new ApiError(410,'CONFIRMATION_CHALLENGE_EXPIRED','Confirmation challenge expired');if(c.subject_id!==identity.subjectId||c.wallet_address!==wallet.wallet)throw new ApiError(403,'CONFIRMATION_SUBJECT_MISMATCH','Confirmation challenge does not belong to this account and wallet');let valid=false;if(wallet.network==='SOLANA')valid=verifySolanaMessage(wallet.wallet,String(c.message),input.signature);else{try{await verifyPersonalMessageSignature(new TextEncoder().encode(String(c.message)),input.signature,{address:wallet.wallet});valid=true}catch{}}if(!valid)throw new ApiError(401,'INVALID_CONFIRMATION_SIGNATURE','Confirmation signature could not be verified');await tx`UPDATE action_confirmation_challenges SET consumed_at=now() WHERE id=${c.id} AND consumed_at IS NULL`;token=randomBytes(32).toString('base64url');const expiresAt=new Date(Date.now()+env.actionConfirmationTokenTtlSeconds*1000);await tx`INSERT INTO action_confirmations(challenge_id,subject_id,wallet_address,action,action_hash,token_hash,expires_at) VALUES(${c.id},${identity.subjectId},${wallet.wallet},${c.action},${c.action_hash},${confirmationTokenHash(token)},${expiresAt})`;});
  return {confirmationToken:token,expiresInSeconds:env.actionConfirmationTokenTtlSeconds};
}

export async function consumeActionConfirmation(request:Request,action:string,payload:unknown){
  if(!env.actionConfirmationRequired)return {required:false};
  const identity=await requirePlatformIdentity(request);const wallet=await requireSession();const token=request.headers.get('x-powerchain-confirmation')?.trim();if(!token)throw new ApiError(428,'ACTION_CONFIRMATION_REQUIRED','x-powerchain-confirmation is required for this privileged action');const hash=actionHash(payload);const sql=db();let id='';await sql.begin(async tx=>{const [row]=await tx`SELECT * FROM action_confirmations WHERE token_hash=${confirmationTokenHash(token)} FOR UPDATE`;if(!row)throw new ApiError(401,'INVALID_ACTION_CONFIRMATION','Action confirmation is invalid');if(row.consumed_at)throw new ApiError(409,'ACTION_CONFIRMATION_CONSUMED','Action confirmation was already consumed');if(new Date(row.expires_at)<=new Date())throw new ApiError(410,'ACTION_CONFIRMATION_EXPIRED','Action confirmation expired');if(row.subject_id!==identity.subjectId||row.wallet_address!==wallet.wallet||row.action!==action||row.action_hash!==hash)throw new ApiError(403,'ACTION_CONFIRMATION_MISMATCH','Action confirmation does not match the exact action payload');await tx`UPDATE action_confirmations SET consumed_at=now() WHERE id=${row.id} AND consumed_at IS NULL`;id=String(row.id)});return {required:true,confirmationId:id};
}
