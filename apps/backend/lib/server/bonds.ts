import 'server-only';
import { PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { db } from './db';
import { ApiError } from './http';
import { env, ConfigurationError } from './config';
import { buildBondInstruction, bondsProgram, pwrcMint } from './anchor';
import { solanaConnection } from './solana';
import { requireValidPwrcMint } from './pwrc';
import { canonicalJson, sha256 } from './crypto';
import { assertPreparedNotExpired, preparedExpiry } from './execution';
import { assertStateChangeSafety } from './safety-gate';

type Session={sub:string;wallet:string;network:'SOLANA'|'SUI'};
type Role='OPERATOR'|'VERIFIER';
type BondAction='BOND'|'INCREASE'|'REQUEST_UNBOND'|'WITHDRAW';
const POLICY_VERSION='BONDS-1.0.0';

async function refreshMaturedBonds(subjectId:string){await db()`UPDATE service_bonds SET status='WITHDRAWABLE',updated_at=now() WHERE subject_id=${subjectId} AND status='UNBONDING' AND unbonding_ends_at IS NOT NULL AND unbonding_ends_at<=now()`;}
export async function listBonds(session:Session){await refreshMaturedBonds(session.sub);return db()`SELECT * FROM service_bonds WHERE subject_id=${session.sub} ORDER BY created_at DESC`;}

async function validateBondState(session:Session,input:{role:Role;action:BondAction;serviceType:string;bondId?:string|null}){
  await refreshMaturedBonds(session.sub);
  if(!input.bondId)return null;
  const[bond]=await db()`SELECT * FROM service_bonds WHERE id=${input.bondId} AND subject_id=${session.sub} LIMIT 1`;
  if(!bond)throw new ApiError(404,'BOND_NOT_FOUND','Service bond not found');
  if(bond.role!==input.role||bond.service_type!==input.serviceType)throw new ApiError(409,'BOND_POLICY_MISMATCH','Bond role or service type does not match');
  const status=String(bond.status);
  if(input.action==='INCREASE'&&status!=='ACTIVE')throw new ApiError(409,'BOND_STATE_INVALID','Only an active bond can be increased');
  if(input.action==='REQUEST_UNBOND'&&status!=='ACTIVE')throw new ApiError(409,'BOND_STATE_INVALID','Only an active bond can enter unbonding');
  if(input.action==='WITHDRAW'&&status!=='WITHDRAWABLE')throw new ApiError(409,'BOND_NOT_WITHDRAWABLE','Bond has not completed its unbonding policy');
  return bond as Record<string,any>;
}

export async function createBondIntent(session:Session,input:{role:Role;action:BondAction;serviceType:string;bondId?:string|null;amountAtomic?:bigint|null;idempotencyKey:string}){await assertStateChangeSafety('BONDS');
  if(session.network!=='SOLANA')throw new ApiError(400,'NETWORK_NOT_SUPPORTED','Bond execution is currently configured for Solana');
  if(!env.bondsProgramId)throw new ConfigurationError('SOLANA_BONDS_PROGRAM_ID is required');
  if(!['OPERATOR','VERIFIER'].includes(input.role))throw new ApiError(400,'INVALID_ROLE','role must be OPERATOR or VERIFIER');
  if(['BOND','INCREASE'].includes(input.action)&&!input.amountAtomic)throw new ApiError(400,'INVALID_ARGUMENT',`${input.action} requires amountAtomic`);
  if(input.action!=='BOND'&&!input.bondId)throw new ApiError(400,'INVALID_ARGUMENT',`${input.action} requires bondId`);
  const bond=await validateBondState(session,input);
  const authoritativeAmount=input.action==='WITHDRAW'&&bond?BigInt(String(bond.amount_atomic)):input.amountAtomic??null;
  const requestHash=sha256(canonicalJson({wallet:session.wallet,role:input.role,action:input.action,serviceType:input.serviceType,bondId:input.bondId??null,amountAtomic:authoritativeAmount?.toString()??null,policyVersion:POLICY_VERSION}));
  const rows=await db()`INSERT INTO service_bond_intents(subject_id,wallet_address,role,action,service_type,bond_id,amount_atomic,idempotency_key,status,policy_version,request_hash) VALUES(${session.sub},${session.wallet},${input.role},${input.action},${input.serviceType},${input.bondId??null},${authoritativeAmount?.toString()??null},${input.idempotencyKey},'QUOTED',${POLICY_VERSION},${requestHash}) ON CONFLICT(subject_id,idempotency_key) DO NOTHING RETURNING *`;
  let intent=rows[0];if(!intent){[intent]=await db()`SELECT * FROM service_bond_intents WHERE subject_id=${session.sub} AND idempotency_key=${input.idempotencyKey} LIMIT 1`;if(!intent||intent.request_hash!==requestHash)throw new ApiError(409,'IDEMPOTENCY_CONFLICT','Idempotency key was already used for a different bond request');}
  return intent;
}

async function loadBondIntent(session:Session,id:string){const[intent]=await db()`SELECT * FROM service_bond_intents WHERE id=${id} AND subject_id=${session.sub} LIMIT 1`;if(!intent)throw new ApiError(404,'BOND_INTENT_NOT_FOUND','Bond intent not found');if(intent.wallet_address!==session.wallet)throw new ApiError(403,'WALLET_MISMATCH','Bond intent belongs to another wallet');return intent as Record<string,any>;}

async function revalidateBondIntent(session:Session,intent:Record<string,any>){if(intent.action!=='BOND')await validateBondState(session,{role:intent.role,action:intent.action,serviceType:intent.service_type,bondId:intent.bond_id});}

export async function prepareBondIntent(session:Session,id:string){await assertStateChangeSafety('BONDS');const intent=await loadBondIntent(session,id);if(!['QUOTED','AWAITING_SIGNATURE'].includes(intent.status))throw new ApiError(409,'INTENT_STATE_INVALID',`Cannot prepare bond intent in ${intent.status}`);await revalidateBondIntent(session,intent);await requireValidPwrcMint();const owner=new PublicKey(session.wallet);const amount=intent.amount_atomic?BigInt(intent.amount_atomic):undefined;if(amount&&['BOND','INCREASE'].includes(intent.action)){const ata=getAssociatedTokenAddressSync(pwrcMint(),owner,false,TOKEN_2022_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID);const balance=await solanaConnection().getTokenAccountBalance(ata,env.solanaCommitment).catch(()=>null);if(BigInt(balance?.value.amount??'0')<amount)throw new ApiError(402,'INSUFFICIENT_PWRC','PWRC balance is insufficient for the bond');}const actionMap={BOND:'create_bond',INCREASE:'increase_bond',REQUEST_UNBOND:'request_unbond',WITHDRAW:'withdraw_bond'} as const;const ix=buildBondInstruction(actionMap[intent.action as BondAction],owner,intent.role,intent.service_type,amount);const connection=solanaConnection();const latest=await connection.getLatestBlockhash(env.solanaCommitment);const tx=new Transaction({feePayer:owner,recentBlockhash:latest.blockhash}).add(ix);const messageHash=sha256(tx.serializeMessage());const expiresAt=preparedExpiry();await db()`UPDATE service_bond_intents SET status='AWAITING_SIGNATURE',prepared_blockhash=${latest.blockhash},last_valid_block_height=${latest.lastValidBlockHeight},prepared_message_hash=${messageHash},prepared_expires_at=${expiresAt},updated_at=now() WHERE id=${id}`;return{intentId:id,transactionBase64:tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64'),blockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight,messageHash,expiresAt};}

export async function submitBondIntent(session:Session,id:string,signedTransactionBase64:string){await assertStateChangeSafety('BONDS');const intent=await loadBondIntent(session,id);if(intent.status!=='AWAITING_SIGNATURE')throw new ApiError(409,'INTENT_STATE_INVALID',`Cannot submit bond intent in ${intent.status}`);assertPreparedNotExpired(intent.prepared_expires_at);await revalidateBondIntent(session,intent);let tx:Transaction;try{tx=Transaction.from(Buffer.from(signedTransactionBase64,'base64'));}catch{throw new ApiError(400,'INVALID_TRANSACTION','Invalid signed Solana transaction');}const wallet=new PublicKey(session.wallet);if(!tx.feePayer?.equals(wallet)||tx.recentBlockhash!==intent.prepared_blockhash||sha256(tx.serializeMessage())!==intent.prepared_message_hash)throw new ApiError(400,'TRANSACTION_MUTATED','Signed transaction differs from prepared bond transaction');if(!tx.instructions.some((ix)=>ix.programId.equals(bondsProgram())))throw new ApiError(400,'PROGRAM_MISMATCH','Bond program instruction is missing');if(!tx.signatures.find((s)=>s.publicKey.equals(wallet))?.signature)throw new ApiError(400,'SIGNATURE_MISSING','Wallet signature is missing');const connection=solanaConnection();const currentBlockHeight=await connection.getBlockHeight(env.solanaCommitment);if(intent.last_valid_block_height!=null&&currentBlockHeight>Number(intent.last_valid_block_height))throw new ApiError(409,'PREPARED_TRANSACTION_EXPIRED','Prepared blockhash has expired; prepare the intent again');const signature=await connection.sendRawTransaction(tx.serialize({requireAllSignatures:true,verifySignatures:true}),{skipPreflight:false,maxRetries:3,preflightCommitment:env.solanaCommitment});await db()`UPDATE service_bond_intents SET status='SUBMITTED',submitted_signature=${signature},updated_at=now() WHERE id=${id}`;return{intentId:id,status:'SUBMITTED',signature};}
export async function getBondIntent(session:Session,id:string){return loadBondIntent(session,id);}
