import 'server-only';
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import { db } from '@/lib/server/db';
import { env, ConfigurationError } from '@/lib/server/config';
import { ApiError } from '@/lib/server/http';
import { safeAction, canonicalActionHash } from '@/lib/server/safe-actions';
import { sha256 } from '@/lib/server/crypto';
import { solanaConnection } from '@/lib/server/solana';
import { suiClient } from '@/lib/sui/sui';
import { integrationPost } from '@/lib/clients/http';
import { quoteSwap, type SwapProviderName } from './swaps';
import { jupiterSwapTransaction } from '@/lib/solana/jupiter';
import type { Session } from '@/lib/server/session';

type SwapRow = Record<string, any>;

function enabled(provider: string) { return env.enabledSwapProviders.includes(provider.toUpperCase()); }
function providerChain(provider: SwapProviderName): 'SOLANA'|'SUI' { return ['CETUS','DEEPBOOK'].includes(provider) ? 'SUI' : 'SOLANA'; }
function expiry() { return new Date(Date.now() + Math.min(env.preparedTransactionTtlSeconds, env.swapQuoteTtlSeconds) * 1000); }

export async function createSwapIntent(request: Request, input: {provider:SwapProviderName;inputAsset:string;outputAsset:string;amountAtomic:string;slippageBps:number}) {
  if(!enabled(input.provider)) throw new ApiError(403,'SWAP_PROVIDER_DISABLED',`${input.provider} is disabled for this deployment`);
  if(!Number.isInteger(input.slippageBps)||input.slippageBps<1||input.slippageBps>env.maxSwapSlippageBps) throw new ApiError(400,'INVALID_SLIPPAGE',`slippageBps must be between 1 and ${env.maxSwapSlippageBps}`);
  const amount=BigInt(input.amountAtomic); if(amount<=0n)throw new ApiError(400,'INVALID_AMOUNT','amountAtomic must be greater than zero');
  const payload={provider:input.provider,inputAsset:input.inputAsset,outputAsset:input.outputAsset,amountAtomic:amount.toString(),slippageBps:input.slippageBps};
  const action=await safeAction(request,'swap.prepare',payload);
  const quote=await quoteSwap(input.provider,input.inputAsset,input.outputAsset,amount.toString(),input.slippageBps);
  const requestHash=canonicalActionHash(payload); const expiresAt=new Date(Date.now()+env.swapQuoteTtlSeconds*1000);
  const rows=await db()<SwapRow[]>`
    INSERT INTO swap_intents(subject_id,wallet_address,chain,provider,input_asset,output_asset,input_atomic,expected_output_atomic,minimum_output_atomic,slippage_bps,quote,status,idempotency_key,request_hash,expires_at)
    VALUES(${action.subjectId},${action.walletAddress},${providerChain(input.provider)},${input.provider},${input.inputAsset},${input.outputAsset},${amount.toString()},${quote.expectedOutputAtomic},${quote.minimumOutputAtomic??null},${input.slippageBps},${JSON.stringify(quote)}::jsonb,'QUOTED',${action.idempotencyKey},${requestHash},${expiresAt})
    ON CONFLICT(subject_id,idempotency_key) DO NOTHING RETURNING *`;
  let intent=rows[0];if(!intent){[intent]=await db()<SwapRow[]>`SELECT * FROM swap_intents WHERE subject_id=${action.subjectId} AND idempotency_key=${action.idempotencyKey} LIMIT 1`;if(!intent||String(intent.request_hash)!==requestHash)throw new ApiError(409,'IDEMPOTENCY_CONFLICT','Idempotency key was already used for a different swap intent');}
  return {intent,quote,expiresAt:intent.expires_at};
}

async function load(session:Session,id:string){const[row]=await db()<SwapRow[]>`SELECT * FROM swap_intents WHERE id=${id}::uuid AND subject_id=${session.sub} LIMIT 1`;if(!row)throw new ApiError(404,'SWAP_INTENT_NOT_FOUND','Swap intent not found');if(String(row.wallet_address)!==session.wallet)throw new ApiError(403,'WALLET_MISMATCH','Swap belongs to another wallet');return row;}

async function providerPrepared(intent:SwapRow, wallet:string):Promise<{transactionBase64:string;routeId?:string}> {
  const provider=String(intent.provider) as SwapProviderName; const quote=intent.quote as any;
  if(provider==='JUPITER'){
    const response:any=await jupiterSwapTransaction(quote.raw??quote,wallet);const tx=response?.swapTransaction;if(!tx)throw new ApiError(502,'SWAP_PREPARE_FAILED','Jupiter returned no swap transaction');return{transactionBase64:String(tx),routeId:response?.requestId??undefined};
  }
  const urls:Record<string,string>={RAYDIUM:env.raydiumApiUrl,METEORA:env.meteoraApiUrl,ORCA:env.orcaApiUrl,CETUS:env.cetusApiUrl,DEEPBOOK:env.deepbookApiUrl};
  const base=urls[provider];if(!base)throw new ConfigurationError(`${provider}_API_URL is required for executable ${provider} swaps`);
  const endpoint=provider==='RAYDIUM'?'/transaction/swap-base-in':'/prepare';
  const response:any=await integrationPost(provider.toLowerCase(),new URL(endpoint,base).toString(),{wallet,quote:quote.raw??quote,swapResponse:quote.raw??quote,txVersion:'V0',slippageBps:Number(intent.slippage_bps)});
  const tx=response?.transactionBase64??response?.transaction??response?.transactionBytes??response?.data?.[0]?.transaction??response?.data?.transaction;
  if(!tx)throw new ApiError(502,'SWAP_PREPARE_FAILED',`${provider} execution service returned no unsigned transaction`);
  return{transactionBase64:String(tx),routeId:response?.routeId??response?.id??undefined};
}

function inspectSolanaTransaction(transactionBase64:string){
  const bytes=Buffer.from(transactionBase64,'base64');
  try{const versioned=VersionedTransaction.deserialize(bytes);const messageBytes=Buffer.from(versioned.message.serialize());const feePayer=versioned.message.staticAccountKeys[0]?.toBase58();return{kind:'VERSIONED' as const,messageHash:sha256(messageBytes),feePayer,blockhash:versioned.message.recentBlockhash};}catch{
    try{const legacy=Transaction.from(bytes);return{kind:'LEGACY' as const,messageHash:sha256(legacy.serializeMessage()),feePayer:legacy.feePayer?.toBase58(),blockhash:legacy.recentBlockhash};}catch{throw new ApiError(502,'SWAP_TRANSACTION_INVALID','Swap provider returned an invalid Solana transaction');}
  }
}

export async function prepareSwapIntent(session:Session,id:string){
  const intent=await load(session,id);if(!['QUOTED','PREPARED','AWAITING_SIGNATURE'].includes(String(intent.status)))throw new ApiError(409,'INTENT_STATE_INVALID',`Cannot prepare swap in ${intent.status}`);if(new Date(intent.expires_at).getTime()<=Date.now())throw new ApiError(409,'SWAP_QUOTE_EXPIRED','Swap quote expired; create a new quote');
  const prepared=await providerPrepared(intent,session.wallet);const preparedExpiresAt=expiry();
  if(String(intent.chain)==='SOLANA'){
    const inspected=inspectSolanaTransaction(prepared.transactionBase64);if(inspected.feePayer!==session.wallet)throw new ApiError(502,'SWAP_FEE_PAYER_MISMATCH','Provider prepared a swap for a different wallet');
    const currentHeight=await solanaConnection().getBlockHeight(env.solanaCommitment);
    await db()`UPDATE swap_intents SET status='AWAITING_SIGNATURE',prepared_transaction_base64=${prepared.transactionBase64},prepared_message_hash=${inspected.messageHash},prepared_blockhash=${inspected.blockhash},last_valid_block_height=${currentHeight+150},prepared_expires_at=${preparedExpiresAt},provider_route_id=${prepared.routeId??null},updated_at=now() WHERE id=${id}::uuid`;
    return{intentId:id,status:'AWAITING_SIGNATURE',network:'SOLANA',transactionBase64:prepared.transactionBase64,messageHash:inspected.messageHash,preparedExpiresAt:preparedExpiresAt.toISOString(),provider:String(intent.provider),minimumOutputAtomic:String(intent.minimum_output_atomic??intent.expected_output_atomic)};
  }
  const bytes=Buffer.from(prepared.transactionBase64,'base64');const messageHash=sha256(bytes);
  await db()`UPDATE swap_intents SET status='AWAITING_SIGNATURE',prepared_transaction_base64=${prepared.transactionBase64},prepared_message_hash=${messageHash},prepared_expires_at=${preparedExpiresAt},provider_route_id=${prepared.routeId??null},updated_at=now() WHERE id=${id}::uuid`;
  return{intentId:id,status:'AWAITING_SIGNATURE',network:'SUI',transactionBase64:prepared.transactionBase64,messageHash,preparedExpiresAt:preparedExpiresAt.toISOString(),provider:String(intent.provider),minimumOutputAtomic:String(intent.minimum_output_atomic??intent.expected_output_atomic)};
}

export async function submitSwapIntent(session:Session,id:string,input:{signedTransactionBase64:string;suiSignature?:string}){
  const intent=await load(session,id);if(String(intent.status)!=='AWAITING_SIGNATURE')throw new ApiError(409,'INTENT_STATE_INVALID',`Cannot submit swap in ${intent.status}`);if(!intent.prepared_expires_at||new Date(intent.prepared_expires_at).getTime()<=Date.now())throw new ApiError(409,'PREPARED_TRANSACTION_EXPIRED','Prepared swap expired; prepare it again');
  let transactionId:string;
  if(String(intent.chain)==='SOLANA'){
    const inspected=inspectSolanaTransaction(input.signedTransactionBase64);if(inspected.feePayer!==session.wallet)throw new ApiError(400,'FEE_PAYER_MISMATCH','Signed swap fee payer differs from authenticated wallet');if(inspected.messageHash!==String(intent.prepared_message_hash))throw new ApiError(400,'TRANSACTION_MUTATED','Signed swap transaction differs from prepared transaction');
    const bytes=Buffer.from(input.signedTransactionBase64,'base64');let raw:Buffer;
    try{const v=VersionedTransaction.deserialize(bytes);if(!v.signatures[0]||v.signatures[0].every(x=>x===0))throw new Error('missing');raw=Buffer.from(v.serialize());}catch{const l=Transaction.from(bytes);const sig=l.signatures.find(s=>s.publicKey.toBase58()===session.wallet)?.signature;if(!sig)throw new ApiError(400,'SIGNATURE_MISSING','Wallet signature is missing');raw=l.serialize({requireAllSignatures:true,verifySignatures:true});}
    transactionId=await solanaConnection().sendRawTransaction(raw,{skipPreflight:false,maxRetries:3,preflightCommitment:env.solanaCommitment});
  }else{
    if(!input.suiSignature)throw new ApiError(400,'SUI_SIGNATURE_REQUIRED','suiSignature is required for a Sui swap');const bytes=Buffer.from(input.signedTransactionBase64,'base64');if(sha256(bytes)!==String(intent.prepared_message_hash))throw new ApiError(400,'TRANSACTION_MUTATED','Signed Sui transaction bytes differ from prepared bytes');
    const result:any=await suiClient().executeTransaction({transaction:new Uint8Array(bytes),signatures:[input.suiSignature],include:{effects:true,events:true}});const tx=result.Transaction??result.FailedTransaction;if(!tx?.digest)throw new ApiError(502,'SUI_EXECUTION_FAILED','Sui did not return a transaction digest');if(tx.status?.success===false)throw new ApiError(409,'SUI_EXECUTION_ABORTED',tx.status?.error?.message??'Sui swap aborted on-chain');transactionId=tx.digest;
  }
  await db()`UPDATE swap_intents SET status='SUBMITTED',transaction_id=${transactionId},updated_at=now() WHERE id=${id}::uuid`;
  await db()`INSERT INTO integration_execution_events(subject_id,integration_id,action,intent_id,chain,network,transaction_id,status,metadata) VALUES(${session.sub},${String(intent.provider).toLowerCase()},'SWAP_SUBMIT',${id},${String(intent.chain)},${String(intent.chain)==='SOLANA'?env.solanaCluster:env.suiNetwork},${transactionId},'SUBMITTED',${JSON.stringify({inputAsset:intent.input_asset,outputAsset:intent.output_asset,inputAtomic:String(intent.input_atomic),minimumOutputAtomic:String(intent.minimum_output_atomic??intent.expected_output_atomic)})}::jsonb)`;
  return{intentId:id,status:'SUBMITTED',transactionId};
}

export async function refreshSwapIntent(session:Session,id:string){
  const intent=await load(session,id);if(!intent.transaction_id)return intent;
  if(String(intent.chain)==='SOLANA'){
    const tx=await solanaConnection().getTransaction(String(intent.transaction_id),{commitment:'finalized',maxSupportedTransactionVersion:0});if(!tx)return intent;const failed=Boolean(tx.meta?.err);await db()`UPDATE swap_intents SET status=${failed?'FAILED':'RECONCILED'},error_code=${failed?'CHAIN_EXECUTION_FAILED':null},error_detail=${failed?JSON.stringify(tx.meta?.err):null},updated_at=now() WHERE id=${id}::uuid`;
  }else{
    const result:any=await suiClient().getTransaction({digest:String(intent.transaction_id),include:{effects:true}}).catch(()=>null);const tx=result?.Transaction??result?.FailedTransaction;if(tx){const success=tx.status?.success!==false;await db()`UPDATE swap_intents SET status=${success?'RECONCILED':'FAILED'},error_code=${success?null:'CHAIN_EXECUTION_FAILED'},updated_at=now() WHERE id=${id}::uuid`;}
  }
  return load(session,id);
}

export async function listSwapIntents(session:Session,limit=50){return db()`SELECT id,chain,provider,input_asset,output_asset,input_atomic,expected_output_atomic,minimum_output_atomic,slippage_bps,status,transaction_id,expires_at,created_at,updated_at FROM swap_intents WHERE subject_id=${session.sub} ORDER BY created_at DESC LIMIT ${Math.max(1,Math.min(limit,100))}`;}
