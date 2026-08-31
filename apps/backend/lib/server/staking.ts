import 'server-only';
import { PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { pools } from '@/lib/data';
import { env, ConfigurationError } from './config';
import { db } from './db';
import { ApiError } from './http';
import { canonicalJson, sha256 } from './crypto';
import { requireValidPwrcMint } from './pwrc';
import { solanaConnection } from './solana';
import { buildPositionInstruction, buildStakeInstruction, pwrcMint, stakingProgram } from './anchor';
import { claimableForPosition, indexRewardEpochs } from './rewards';
import { assertPreparedNotExpired, preparedExpiry } from './execution';
import { assertStateChangeSafety } from './safety-gate';

type Session = { sub: string; wallet: string; network: 'SOLANA' | 'SUI'; kind: 'EXTERNAL' | 'EMBEDDED' };
export type StakingAction = 'STAKE' | 'INCREASE' | 'REQUEST_UNSTAKE' | 'CANCEL_UNSTAKE' | 'WITHDRAW' | 'CLAIM' | 'COMPOUND';

const POLICY_VERSION = 'STAKING-1.0.0';

function poolById(poolId: string | null | undefined) {
  const pool = pools.find((x) => x.id === poolId);
  if (!pool) throw new ApiError(400, 'POOL_NOT_FOUND', 'Unknown staking pool');
  return pool;
}

async function refreshMaturedPositions(subjectId: string) {
  const sql = db();
  await sql`UPDATE staking_positions SET status='ACTIVE',updated_at=now() WHERE subject_id=${subjectId} AND status='LOCKED' AND unlock_at IS NOT NULL AND unlock_at <= now()`;
  await sql`UPDATE staking_positions SET status='WITHDRAWABLE',updated_at=now() WHERE subject_id=${subjectId} AND status='UNBONDING' AND unbonding_ends_at IS NOT NULL AND unbonding_ends_at <= now()`;
}

export async function createStakingIntent(session: Session, input: { action: StakingAction; poolId?: string | null; positionId?: string | null; amountAtomic?: bigint | null; idempotencyKey: string }) {
  await assertStateChangeSafety('STAKING');
  if (session.network !== 'SOLANA') throw new ApiError(400, 'NETWORK_NOT_SUPPORTED', 'Staking execution is currently configured for Solana');
  if (!env.pwrcMint || !env.stakingProgramId) throw new ConfigurationError('PWRC_MINT and SOLANA_STAKING_PROGRAM_ID are required for staking execution');
  await refreshMaturedPositions(session.sub);
  const pool = input.poolId ? poolById(input.poolId) : null;
  if (input.action === 'STAKE' && (!pool || !input.amountAtomic)) throw new ApiError(400, 'INVALID_ARGUMENT', 'STAKE requires poolId and amountAtomic');
  if (input.action === 'INCREASE' && !input.amountAtomic) throw new ApiError(400, 'INVALID_ARGUMENT', 'INCREASE requires amountAtomic');
  if (input.action !== 'STAKE' && !input.positionId) throw new ApiError(400, 'INVALID_ARGUMENT', `${input.action} requires positionId`);

  let authoritativeAmount = input.amountAtomic ?? null;
  if (input.action !== 'STAKE') {
    const [position] = await db()`SELECT * FROM staking_positions WHERE id=${input.positionId} AND subject_id=${session.sub} LIMIT 1`;
    if (!position) throw new ApiError(404, 'POSITION_NOT_FOUND', 'Staking position not found');
    const status = String(position.status);
    if (input.action === 'INCREASE' && !['ACTIVE','LOCKED'].includes(status)) throw new ApiError(409, 'POSITION_STATE_INVALID', `Cannot increase a ${status.toLowerCase()} position`);
    if (input.action === 'REQUEST_UNSTAKE') {
      if (status === 'LOCKED') throw new ApiError(409, 'POSITION_LOCKED', 'This position has not reached its unlock date');
      if (status !== 'ACTIVE') throw new ApiError(409, 'POSITION_STATE_INVALID', `Cannot request unstake from a ${status.toLowerCase()} position`);
      authoritativeAmount = BigInt(String(position.principal_atomic));
    }
    if (input.action === 'CANCEL_UNSTAKE' && status !== 'UNBONDING') throw new ApiError(409, 'POSITION_STATE_INVALID', 'Only an unbonding position can cancel unstake');
    if (input.action === 'WITHDRAW') {
      if (status !== 'WITHDRAWABLE') throw new ApiError(409, 'NOT_WITHDRAWABLE', 'Position has not completed its unbonding period');
      authoritativeAmount = BigInt(String(position.principal_atomic));
    }
    if (['CLAIM','COMPOUND'].includes(input.action) && !['ACTIVE','LOCKED'].includes(status)) throw new ApiError(409, 'POSITION_STATE_INVALID', `Rewards cannot be claimed from a ${status.toLowerCase()} position`);
  }

  let rewardQuote: Awaited<ReturnType<typeof claimableForPosition>> | null = null;
  if ((input.action === 'CLAIM' || input.action === 'COMPOUND') && input.positionId) {
    await indexRewardEpochs(new Date());
    rewardQuote = await claimableForPosition(input.positionId);
    if (BigInt(rewardQuote.claimableAtomic) <= 0n) throw new ApiError(409, 'NO_REWARDS_AVAILABLE', 'No claimable PWRC rewards are available for this position');
  }

  const quote = {
    version: 1,
    action: input.action,
    wallet: session.wallet,
    network: 'SOLANA',
    cluster: env.solanaCluster,
    mint: env.pwrcMint,
    stakingProgramId: env.stakingProgramId,
    poolId: pool?.id ?? input.poolId ?? null,
    positionId: input.positionId ?? null,
    amountAtomic: authoritativeAmount?.toString() ?? null,
    authoritativeRewardAtomic: rewardQuote?.claimableAtomic ?? null,
    lockDays: pool?.lockDays ?? null,
    cooldownDays: pool?.cooldownDays ?? null,
    governanceMultiplierBps: pool ? Math.round(pool.weightValue * 10_000) : null,
    policyVersion: POLICY_VERSION,
  };
  const quoteHash = sha256(canonicalJson(quote));
  const sql = db();
  const rows = await sql`
    INSERT INTO staking_intents(subject_id,wallet_address,network,action,pool_id,position_id,amount_atomic,authoritative_reward_atomic,reward_quote,idempotency_key,status,quote_hash,policy_version)
    VALUES(${session.sub},${session.wallet},'SOLANA',${input.action},${pool?.id ?? input.poolId ?? null},${input.positionId ?? null},${authoritativeAmount?.toString() ?? null},${rewardQuote?.claimableAtomic ?? null},${rewardQuote ? sql.json(rewardQuote) : null},${input.idempotencyKey},'QUOTED',${quoteHash},${POLICY_VERSION})
    ON CONFLICT(subject_id,idempotency_key) DO NOTHING RETURNING *
  `;
  let intent = rows[0];
  if (!intent) {
    [intent] = await sql`SELECT * FROM staking_intents WHERE subject_id=${session.sub} AND idempotency_key=${input.idempotencyKey} LIMIT 1`;
    if (!intent || intent.quote_hash !== quoteHash) throw new ApiError(409,'IDEMPOTENCY_CONFLICT','Idempotency key was already used for a different staking request');
  }
  return { intent, quote };
}

async function loadIntent(session: Session, intentId: string) {
  const [intent] = await db()`SELECT * FROM staking_intents WHERE id=${intentId} AND subject_id=${session.sub} LIMIT 1`;
  if (!intent) throw new ApiError(404, 'INTENT_NOT_FOUND', 'Staking intent not found');
  if (intent.wallet_address !== session.wallet) throw new ApiError(403, 'WALLET_MISMATCH', 'Intent belongs to another wallet');
  return intent as Record<string, any>;
}

async function positionForIntent(session: Session, intent: Record<string, any>) {
  if (!intent.position_id) return null;
  const [position] = await db()`SELECT * FROM staking_positions WHERE id=${intent.position_id} AND subject_id=${session.sub} LIMIT 1`;
  if (!position) throw new ApiError(404, 'POSITION_NOT_FOUND', 'Staking position not found');
  return position as Record<string, any>;
}

export async function prepareStakingIntent(session: Session, intentId: string) {
  await assertStateChangeSafety('STAKING');
  const intent = await loadIntent(session, intentId);
  if (!['QUOTED', 'READY', 'AWAITING_SIGNATURE'].includes(intent.status)) throw new ApiError(409, 'INTENT_STATE_INVALID', `Cannot prepare intent in ${intent.status}`);
  await requireValidPwrcMint();
  const connection = solanaConnection();
  const owner = new PublicKey(session.wallet);
  const mint = pwrcMint();
  const userAta = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const amount = intent.amount_atomic ? BigInt(intent.amount_atomic) : null;

  if (amount && ['STAKE', 'INCREASE'].includes(intent.action)) {
    const balance = await connection.getTokenAccountBalance(userAta, env.solanaCommitment).catch(() => null);
    const available = BigInt(balance?.value.amount ?? '0');
    if (available < amount) throw new ApiError(402, 'INSUFFICIENT_PWRC', 'PWRC token account balance is insufficient', { availableAtomic: available.toString(), requiredAtomic: amount.toString() });
  }

  let instruction;
  if (intent.action === 'STAKE') {
    instruction = buildStakeInstruction(owner, intent.id, intent.pool_id, amount!);
  } else {
    const position = await positionForIntent(session, intent);
    const onchainPosition = position?.onchain_address ? new PublicKey(position.onchain_address) : null;
    if (!onchainPosition) throw new ApiError(409, 'POSITION_CHAIN_ADDRESS_MISSING', 'Position has no reconciled on-chain address');
    const map: Record<string, Parameters<typeof buildPositionInstruction>[0]> = {
      INCREASE: 'increase_stake', REQUEST_UNSTAKE: 'request_unstake', CANCEL_UNSTAKE: 'cancel_unstake', WITHDRAW: 'withdraw', CLAIM: 'claim_rewards', COMPOUND: 'compound_rewards'
    };
    const executionAmount = ['CLAIM','COMPOUND'].includes(String(intent.action))
      ? BigInt(String(intent.authoritative_reward_atomic ?? '0'))
      : amount;
    instruction = buildPositionInstruction(map[intent.action], owner, intent.id, position.pool_id, onchainPosition, executionAmount && executionAmount > 0n ? executionAmount : undefined);
  }

  const latest = await connection.getLatestBlockhash(env.solanaCommitment);
  const tx = new Transaction({ feePayer: owner, recentBlockhash: latest.blockhash }).add(instruction);
  const messageHash = sha256(tx.serializeMessage());
  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');

  const expiresAt=preparedExpiry();
  await db()`UPDATE staking_intents SET status='AWAITING_SIGNATURE',prepared_blockhash=${latest.blockhash},last_valid_block_height=${latest.lastValidBlockHeight},prepared_message_hash=${messageHash},prepared_expires_at=${expiresAt},updated_at=now() WHERE id=${intent.id}`;
  return { intentId: intent.id, status: 'AWAITING_SIGNATURE', transactionBase64: serialized, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight, messageHash, network: 'SOLANA', cluster: env.solanaCluster };
}

export async function submitStakingIntent(session: Session, intentId: string, signedTransactionBase64: string) {
  await assertStateChangeSafety('STAKING');
  const intent = await loadIntent(session, intentId);
  if (!['AWAITING_SIGNATURE','SIGNED'].includes(intent.status)) throw new ApiError(409,'INTENT_STATE_INVALID',`Cannot submit intent in ${intent.status}`);
  assertPreparedNotExpired(intent.prepared_expires_at);
  let tx: Transaction;
  try { tx = Transaction.from(Buffer.from(signedTransactionBase64, 'base64')); }
  catch { throw new ApiError(400, 'INVALID_TRANSACTION', 'signedTransactionBase64 is not a valid Solana legacy transaction'); }
  if (!tx.feePayer?.equals(new PublicKey(session.wallet))) throw new ApiError(400, 'FEE_PAYER_MISMATCH', 'Transaction fee payer does not match authenticated wallet');
  if (tx.recentBlockhash !== intent.prepared_blockhash) throw new ApiError(400, 'BLOCKHASH_MISMATCH', 'Transaction blockhash differs from prepared transaction');
  if (sha256(tx.serializeMessage()) !== intent.prepared_message_hash) throw new ApiError(400, 'TRANSACTION_MUTATED', 'Signed transaction message differs from the prepared transaction');
  const ownerSignature = tx.signatures.find((s) => s.publicKey.equals(new PublicKey(session.wallet)))?.signature;
  if (!ownerSignature) throw new ApiError(400, 'SIGNATURE_MISSING', 'Authenticated wallet signature is missing');
  if (!tx.instructions.some((ix) => ix.programId.equals(stakingProgram()))) throw new ApiError(400, 'PROGRAM_MISMATCH', 'Prepared staking program is not present in the signed transaction');

  const connection = solanaConnection();
  const currentBlockHeight=await connection.getBlockHeight(env.solanaCommitment);
  if(intent.last_valid_block_height!=null && currentBlockHeight>Number(intent.last_valid_block_height)) throw new ApiError(409,'PREPARED_TRANSACTION_EXPIRED','Prepared blockhash has expired; prepare the intent again');
  const raw = tx.serialize({ requireAllSignatures: true, verifySignatures: true });
  const signature = await connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3, preflightCommitment: env.solanaCommitment });
  await db()`UPDATE staking_intents SET status='SUBMITTED', submitted_signature=${signature}, updated_at=now() WHERE id=${intent.id}`;
  return { intentId: intent.id, status: 'SUBMITTED', signature };
}

export async function getStakingIntent(session: Session, id: string) {
  return loadIntent(session, id);
}

export async function listPositions(session: Session) {
  await refreshMaturedPositions(session.sub);
  return db()`SELECT * FROM staking_positions WHERE subject_id=${session.sub} ORDER BY created_at DESC`;
}
