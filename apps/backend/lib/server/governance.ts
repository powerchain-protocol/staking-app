import 'server-only';
import { PublicKey, Transaction } from '@solana/web3.js';
import { db } from './db';
import { ApiError } from './http';
import { env, ConfigurationError } from './config';
import { solanaConnection } from './solana';
import { buildGovernanceExecuteInstruction, buildGovernanceVoteInstruction, governanceProgram } from './anchor';
import { canonicalJson, sha256 } from './crypto';
import { assertPreparedNotExpired, preparedExpiry } from './execution';
import { assertStateChangeSafety } from './safety-gate';

type Session={sub:string;wallet:string;network:'SOLANA'|'SUI'};
type Choice='FOR'|'AGAINST'|'ABSTAIN';

export async function governanceWeight(subjectId:string){const[row]=await db()`SELECT COALESCE(SUM(effective_weight_atomic),0)::text AS weight FROM staking_positions WHERE subject_id=${subjectId} AND status IN ('ACTIVE','LOCKED','UNBONDING')`;return BigInt(String(row?.weight??'0'));}

export async function refreshGovernanceProposalStates(now=new Date()){
  const proposals=await db()`SELECT * FROM governance_proposals WHERE status='ACTIVE' AND ends_at<=${now} ORDER BY ends_at ASC`;
  for(const proposal of proposals as Array<Record<string,any>>){
    await db().begin(async(tx)=>{
      const[current]=await tx`SELECT * FROM governance_proposals WHERE id=${proposal.id} FOR UPDATE`;
      if(!current||current.status!=='ACTIVE'||new Date(current.ends_at)>now)return;
      const forWeight=BigInt(String(current.for_weight_atomic??0));
      const against=BigInt(String(current.against_weight_atomic??0));
      const abstain=BigInt(String(current.abstain_weight_atomic??0));
      const quorum=BigInt(String(current.quorum_weight_atomic??0));
      const turnout=forWeight+against+abstain;
      const succeeded=turnout>=quorum&&forWeight>against;
      const executionNotBefore=succeeded?new Date(now.getTime()+env.governanceExecutionDelaySeconds*1000):null;
      await tx`UPDATE governance_proposals SET status=${succeeded?'SUCCEEDED':'DEFEATED'},resolved_at=${now},execution_not_before=${executionNotBefore},execution_policy_version='GOV-EXEC-1.0.0',updated_at=now() WHERE id=${current.id}`;
    });
  }
}

export async function listGovernanceProposals(){await refreshGovernanceProposalStates();return db()`SELECT * FROM governance_proposals ORDER BY ends_at DESC`;}

export async function createGovernanceIntent(session:Session,input:{action:'VOTE'|'EXECUTE';proposalId:string;choice?:Choice;idempotencyKey:string}){await assertStateChangeSafety('GOVERNANCE');
  if(session.network!=='SOLANA')throw new ApiError(400,'NETWORK_NOT_SUPPORTED','Governance execution is currently configured for Solana');
  if(!env.governanceProgramId)throw new ConfigurationError('SOLANA_GOVERNANCE_PROGRAM_ID is required');
  await refreshGovernanceProposalStates();
  const[proposal]=await db()`SELECT * FROM governance_proposals WHERE id=${input.proposalId} LIMIT 1`;
  if(!proposal)throw new ApiError(404,'PROPOSAL_NOT_FOUND','Governance proposal not found');
  const now=new Date();
  if(input.action==='VOTE'){
    if(!input.choice||!['FOR','AGAINST','ABSTAIN'].includes(input.choice))throw new ApiError(400,'INVALID_VOTE','choice must be FOR, AGAINST or ABSTAIN');
    if(proposal.status!=='ACTIVE'||new Date(proposal.ends_at)<=now)throw new ApiError(409,'PROPOSAL_NOT_ACTIVE','Proposal is not open for voting');
    const[existingVote]=await db()`SELECT id FROM governance_votes WHERE proposal_id=${proposal.id} AND wallet_address=${session.wallet} LIMIT 1`;
    if(existingVote)throw new ApiError(409,'VOTE_ALREADY_CAST','This wallet already has a reconciled vote for the proposal');
  }else{
    if(proposal.status!=='SUCCEEDED')throw new ApiError(409,'PROPOSAL_NOT_EXECUTABLE','Proposal must be in SUCCEEDED state before execution');
    if(proposal.execution_not_before&&new Date(proposal.execution_not_before)>now)throw new ApiError(409,'GOVERNANCE_TIMELOCK_ACTIVE','Proposal execution timelock has not elapsed',{executionNotBefore:proposal.execution_not_before});
  }
  const weight=input.action==='VOTE'?await governanceWeight(session.sub):0n;
  if(input.action==='VOTE'&&weight<=0n)throw new ApiError(403,'NO_GOVERNANCE_WEIGHT','No eligible governance voting weight is available');
  const requestHash=sha256(canonicalJson({action:input.action,proposalId:input.proposalId,choice:input.choice??null,wallet:session.wallet,votingWeightAtomic:weight.toString()}));
  const rows=await db()`INSERT INTO governance_intents(subject_id,wallet_address,action,proposal_id,choice,voting_weight_atomic,idempotency_key,status,request_hash) VALUES(${session.sub},${session.wallet},${input.action},${input.proposalId},${input.choice??null},${weight.toString()},${input.idempotencyKey},'QUOTED',${requestHash}) ON CONFLICT(subject_id,idempotency_key) DO NOTHING RETURNING *`;
  let intent=rows[0];
  if(!intent){[intent]=await db()`SELECT * FROM governance_intents WHERE subject_id=${session.sub} AND idempotency_key=${input.idempotencyKey} LIMIT 1`;if(!intent||intent.request_hash!==requestHash)throw new ApiError(409,'IDEMPOTENCY_CONFLICT','Idempotency key was already used for a different governance request');}
  return{intent,proposal,votingWeightAtomic:weight.toString()};
}

async function loadGovernanceIntent(session:Session,id:string){const[row]=await db()`SELECT gi.*,gp.onchain_proposal_id,gp.status AS proposal_status,gp.ends_at,gp.execution_not_before FROM governance_intents gi JOIN governance_proposals gp ON gp.id=gi.proposal_id WHERE gi.id=${id} AND gi.subject_id=${session.sub} LIMIT 1`;if(!row)throw new ApiError(404,'GOVERNANCE_INTENT_NOT_FOUND','Governance intent not found');if(row.wallet_address!==session.wallet)throw new ApiError(403,'WALLET_MISMATCH','Governance intent belongs to another wallet');return row as Record<string,any>;}

async function revalidateGovernanceIntent(intent:Record<string,any>){await refreshGovernanceProposalStates();const[proposal]=await db()`SELECT * FROM governance_proposals WHERE id=${intent.proposal_id} LIMIT 1`;if(!proposal)throw new ApiError(404,'PROPOSAL_NOT_FOUND','Governance proposal not found');if(intent.action==='VOTE'){if(proposal.status!=='ACTIVE'||new Date(proposal.ends_at)<=new Date())throw new ApiError(409,'PROPOSAL_NOT_ACTIVE','Proposal is no longer open for voting');const current=await governanceWeight(String(intent.subject_id));if(current<BigInt(String(intent.voting_weight_atomic??0)))throw new ApiError(409,'GOVERNANCE_WEIGHT_CHANGED','Eligible governance weight decreased after intent creation; create a new vote intent');}else{if(proposal.status!=='SUCCEEDED')throw new ApiError(409,'PROPOSAL_NOT_EXECUTABLE','Proposal is not executable');if(proposal.execution_not_before&&new Date(proposal.execution_not_before)>new Date())throw new ApiError(409,'GOVERNANCE_TIMELOCK_ACTIVE','Proposal execution timelock has not elapsed',{executionNotBefore:proposal.execution_not_before});}}

export async function prepareGovernanceIntent(session:Session,id:string){await assertStateChangeSafety('GOVERNANCE');const intent=await loadGovernanceIntent(session,id);if(!['QUOTED','AWAITING_SIGNATURE'].includes(intent.status))throw new ApiError(409,'INTENT_STATE_INVALID',`Cannot prepare governance intent in ${intent.status}`);await revalidateGovernanceIntent(intent);const voter=new PublicKey(session.wallet);const instruction=intent.action==='VOTE'?buildGovernanceVoteInstruction(voter,intent.onchain_proposal_id,intent.choice):buildGovernanceExecuteInstruction(voter,intent.onchain_proposal_id);const connection=solanaConnection();const latest=await connection.getLatestBlockhash(env.solanaCommitment);const tx=new Transaction({feePayer:voter,recentBlockhash:latest.blockhash}).add(instruction);const messageHash=sha256(tx.serializeMessage());const expiresAt=preparedExpiry();await db()`UPDATE governance_intents SET status='AWAITING_SIGNATURE',prepared_blockhash=${latest.blockhash},last_valid_block_height=${latest.lastValidBlockHeight},prepared_message_hash=${messageHash},prepared_expires_at=${expiresAt},updated_at=now() WHERE id=${id}`;return{intentId:id,transactionBase64:tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64'),messageHash,blockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight,expiresAt};}

export async function submitGovernanceIntent(session:Session,id:string,signedTransactionBase64:string){await assertStateChangeSafety('GOVERNANCE');const intent=await loadGovernanceIntent(session,id);if(intent.status!=='AWAITING_SIGNATURE')throw new ApiError(409,'INTENT_STATE_INVALID',`Cannot submit governance intent in ${intent.status}`);assertPreparedNotExpired(intent.prepared_expires_at);await revalidateGovernanceIntent(intent);let tx:Transaction;try{tx=Transaction.from(Buffer.from(signedTransactionBase64,'base64'));}catch{throw new ApiError(400,'INVALID_TRANSACTION','Invalid signed Solana transaction');}const wallet=new PublicKey(session.wallet);if(!tx.feePayer?.equals(wallet))throw new ApiError(400,'FEE_PAYER_MISMATCH','Transaction fee payer mismatch');if(tx.recentBlockhash!==intent.prepared_blockhash||sha256(tx.serializeMessage())!==intent.prepared_message_hash)throw new ApiError(400,'TRANSACTION_MUTATED','Signed transaction differs from prepared governance transaction');if(!tx.instructions.some((ix)=>ix.programId.equals(governanceProgram())))throw new ApiError(400,'PROGRAM_MISMATCH','Governance program instruction is missing');if(!tx.signatures.find((s)=>s.publicKey.equals(wallet))?.signature)throw new ApiError(400,'SIGNATURE_MISSING','Wallet signature is missing');const connection=solanaConnection();const currentBlockHeight=await connection.getBlockHeight(env.solanaCommitment);if(intent.last_valid_block_height!=null&&currentBlockHeight>Number(intent.last_valid_block_height))throw new ApiError(409,'PREPARED_TRANSACTION_EXPIRED','Prepared blockhash has expired; prepare the intent again');const signature=await connection.sendRawTransaction(tx.serialize({requireAllSignatures:true,verifySignatures:true}),{skipPreflight:false,maxRetries:3,preflightCommitment:env.solanaCommitment});await db()`UPDATE governance_intents SET status='SUBMITTED',submitted_signature=${signature},updated_at=now() WHERE id=${id}`;return{intentId:id,status:'SUBMITTED',signature};}

export async function getGovernanceIntent(session:Session,id:string){return loadGovernanceIntent(session,id);}
