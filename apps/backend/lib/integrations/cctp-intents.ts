import 'server-only';
import { Transaction } from '@solana/web3.js';
import { db } from '@/lib/server/db';
import { env, ConfigurationError } from '@/lib/server/config';
import { ApiError } from '@/lib/server/http';
import { safeAction, canonicalActionHash } from '@/lib/server/safe-actions';
import { sha256 } from '@/lib/server/crypto';
import { solanaConnection } from '@/lib/server/solana';
import { cctpFees, cctpMessages } from './cctp';
import { prepareCctpBurn } from './cctp-solana';
import { integrationPost } from '@/lib/clients/http';
import type { Session } from '@/lib/server/session';

export type CctpTransferMode = 'STANDARD' | 'FAST';

type CctpIntentRow = Record<string, any>;

function preparedExpiry() { return new Date(Date.now() + env.preparedTransactionTtlSeconds * 1000); }
function assertPreparedNotExpired(value: unknown) {
  if (!value || new Date(String(value)).getTime() <= Date.now()) throw new ApiError(409, 'PREPARED_TRANSACTION_EXPIRED', 'Prepared CCTP transaction expired; prepare it again');
}
function minimumFeeNumber(value: any): number | null {
  const direct = Number(value?.minimumFee ?? value?.data?.minimumFee ?? value?.fees?.[0]?.minimumFee);
  return Number.isFinite(direct) && direct >= 0 ? direct : null;
}
function feeFromCircleRate(amountAtomic: bigint, minimumFee: number) {
  // Circle represents minimumFee as a fractional percentage with precision to 1e-4 percentage points.
  const millionths = BigInt(Math.max(0, Math.round(minimumFee * 100)));
  const protocolFee = amountAtomic * millionths / 1_000_000n;
  return protocolFee + (protocolFee * BigInt(env.cctpFeeBufferBps) / 10_000n);
}

async function quoteMaxFee(amountAtomic: bigint, mode: CctpTransferMode, sourceDomain: number, destinationDomain: number) {
  if (mode === 'STANDARD') return { maxFeeAtomic: 0n, minFinalityThreshold: env.cctpMinFinalityThreshold, feeSource: 'STANDARD_ZERO_FEE' };
  const response = await cctpFees(sourceDomain, destinationDomain);
  const minimumFee = minimumFeeNumber(response);
  if (minimumFee == null) throw new ApiError(502, 'CCTP_FEE_UNAVAILABLE', 'Circle did not return a usable CCTP Fast Transfer minimumFee');
  const maxFeeAtomic = feeFromCircleRate(amountAtomic, minimumFee);
  if (env.cctpMaxFeeAtomic != null && maxFeeAtomic > env.cctpMaxFeeAtomic) throw new ApiError(409, 'CCTP_FEE_LIMIT_EXCEEDED', 'Buffered CCTP fee exceeds configured maximum', { maxFeeAtomic: maxFeeAtomic.toString(), configuredMaximumAtomic: env.cctpMaxFeeAtomic.toString() });
  return { maxFeeAtomic, minFinalityThreshold: env.cctpFastFinalityThreshold, feeSource: 'CIRCLE_V2_MINIMUM_FEE_BUFFERED', minimumFee };
}

export async function createCctpIntent(request: Request, body: {
  amountAtomic: string;
  recipient: string;
  destinationDomain?: number;
  transferMode?: CctpTransferMode;
}) {
  const amountAtomic = BigInt(body.amountAtomic);
  if (amountAtomic <= 0n) throw new ApiError(400, 'INVALID_AMOUNT', 'amountAtomic must be greater than zero');
  if (!env.cctpUsdcMint || env.cctpSourceDomainId == null) throw new ConfigurationError('CCTP Solana source configuration is incomplete');
  const destinationDomain = body.destinationDomain ?? env.cctpDestinationDomainId;
  if (destinationDomain == null || !Number.isInteger(destinationDomain) || destinationDomain < 0) throw new ApiError(400, 'INVALID_DESTINATION_DOMAIN', 'A valid CCTP destinationDomain is required');
  const transferMode: CctpTransferMode = body.transferMode === 'FAST' ? 'FAST' : 'STANDARD';
  const payload = { amountAtomic: amountAtomic.toString(), recipient: body.recipient.trim(), sourceDomain: env.cctpSourceDomainId, destinationDomain, transferMode };
  const action = await safeAction(request, 'bridge.cctp', payload);
  const requestHash = canonicalActionHash(payload);
  const fee = await quoteMaxFee(amountAtomic, transferMode, env.cctpSourceDomainId, destinationDomain);
  const rows = await db()<CctpIntentRow[]>`
    INSERT INTO cctp_intents(subject_id,wallet_address,source_domain,destination_domain,amount_atomic,recipient,status,transfer_mode,max_fee_atomic,min_finality_threshold,idempotency_key,request_hash)
    VALUES(${action.subjectId},${action.walletAddress},${env.cctpSourceDomainId},${destinationDomain},${amountAtomic.toString()},${payload.recipient},'QUOTED',${transferMode},${fee.maxFeeAtomic.toString()},${fee.minFinalityThreshold},${action.idempotencyKey},${requestHash})
    ON CONFLICT(subject_id,idempotency_key) DO NOTHING RETURNING *
  `;
  let intent = rows[0];
  if (!intent) {
    [intent] = await db()<CctpIntentRow[]>`SELECT * FROM cctp_intents WHERE subject_id=${action.subjectId} AND idempotency_key=${action.idempotencyKey} LIMIT 1`;
    if (!intent || String(intent.request_hash) !== requestHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for a different CCTP intent');
  }
  return { intent, quote: { amountAtomic: amountAtomic.toString(), maxFeeAtomic: fee.maxFeeAtomic.toString(), minFinalityThreshold: fee.minFinalityThreshold, transferMode, sourceDomain: env.cctpSourceDomainId, destinationDomain, usdcMint: env.cctpUsdcMint, feeSource: fee.feeSource } };
}

async function load(session: Session, id: string) {
  const [row] = await db()<CctpIntentRow[]>`SELECT * FROM cctp_intents WHERE id=${id}::uuid AND subject_id=${session.sub} LIMIT 1`;
  if (!row) throw new ApiError(404, 'CCTP_INTENT_NOT_FOUND', 'CCTP intent not found');
  if (String(row.wallet_address) !== session.wallet) throw new ApiError(403, 'WALLET_MISMATCH', 'CCTP intent belongs to another wallet');
  return row;
}

export async function prepareCctpIntent(session: Session, id: string) {
  const intent = await load(session, id);
  if (!['QUOTED','AWAITING_SIGNATURE'].includes(String(intent.status))) throw new ApiError(409, 'INTENT_STATE_INVALID', `Cannot prepare CCTP intent in ${intent.status}`);
  const prepared = await prepareCctpBurn({ owner: session.wallet, amountAtomic: BigInt(String(intent.amount_atomic)), destinationDomain: Number(intent.destination_domain), recipient: String(intent.recipient), maxFeeAtomic: BigInt(String(intent.max_fee_atomic)), minFinalityThreshold: Number(intent.min_finality_threshold) });
  const messageHash = sha256(prepared.messageHashInput);
  const expiresAt = preparedExpiry();
  await db()`UPDATE cctp_intents SET status='AWAITING_SIGNATURE',prepared_blockhash=${prepared.blockhash},last_valid_block_height=${prepared.lastValidBlockHeight},prepared_message_hash=${messageHash},prepared_expires_at=${expiresAt},event_account=${prepared.eventAccount},updated_at=now() WHERE id=${id}::uuid`;
  return { intentId: id, status: 'AWAITING_SIGNATURE', transactionBase64: prepared.transactionBase64, messageHash, preparedExpiresAt: expiresAt.toISOString(), blockhash: prepared.blockhash, lastValidBlockHeight: prepared.lastValidBlockHeight, eventAccount: prepared.eventAccount, sourceTokenAccount: prepared.sourceTokenAccount, maxFeeAtomic: String(intent.max_fee_atomic), minFinalityThreshold: Number(intent.min_finality_threshold), sourceDomain: Number(intent.source_domain), destinationDomain: Number(intent.destination_domain), programIds: prepared.programIds };
}

export async function submitCctpIntent(session: Session, id: string, signedTransactionBase64: string) {
  const intent = await load(session, id);
  if (String(intent.status) !== 'AWAITING_SIGNATURE') throw new ApiError(409, 'INTENT_STATE_INVALID', `Cannot submit CCTP intent in ${intent.status}`);
  assertPreparedNotExpired(intent.prepared_expires_at);
  let tx: Transaction;
  try { tx = Transaction.from(Buffer.from(signedTransactionBase64, 'base64')); }
  catch { throw new ApiError(400, 'INVALID_TRANSACTION', 'signedTransactionBase64 is not a valid Solana legacy transaction'); }
  const owner = tx.feePayer?.toBase58();
  if (owner !== session.wallet) throw new ApiError(400, 'FEE_PAYER_MISMATCH', 'CCTP transaction fee payer does not match authenticated wallet');
  if (tx.recentBlockhash !== String(intent.prepared_blockhash)) throw new ApiError(400, 'BLOCKHASH_MISMATCH', 'CCTP transaction blockhash differs from prepared transaction');
  if (sha256(tx.serializeMessage()) !== String(intent.prepared_message_hash)) throw new ApiError(400, 'TRANSACTION_MUTATED', 'Signed CCTP transaction differs from the prepared message');
  const walletKey = tx.feePayer!;
  if (!tx.signatures.find((s)=>s.publicKey.equals(walletKey))?.signature) throw new ApiError(400, 'SIGNATURE_MISSING', 'Authenticated wallet signature is missing');
  if (intent.event_account && !tx.signatures.find((s)=>s.publicKey.toBase58()===String(intent.event_account))?.signature) throw new ApiError(400, 'CCTP_EVENT_SIGNATURE_MISSING', 'CCTP event-account partial signature is missing');
  const messenger = String(env.cctpTokenMessengerMinterProgramId);
  if (!tx.instructions.some((ix)=>ix.programId.toBase58()===messenger)) throw new ApiError(400, 'PROGRAM_MISMATCH', 'CCTP TokenMessengerMinter V2 instruction is missing');
  const connection = solanaConnection();
  const currentBlockHeight = await connection.getBlockHeight(env.solanaCommitment);
  if (intent.last_valid_block_height != null && currentBlockHeight > Number(intent.last_valid_block_height)) throw new ApiError(409, 'PREPARED_TRANSACTION_EXPIRED', 'Prepared CCTP blockhash expired; prepare again');
  const raw = tx.serialize({ requireAllSignatures: true, verifySignatures: true });
  const signature = await connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3, preflightCommitment: env.solanaCommitment });
  await db()`UPDATE cctp_intents SET status='BURN_SUBMITTED',source_tx=${signature},updated_at=now() WHERE id=${id}::uuid`;
  await db()`INSERT INTO integration_execution_events(subject_id,integration_id,action,intent_id,chain,network,transaction_id,status,metadata) VALUES(${session.sub},'cctp','BURN_SUBMIT',${id},'SOLANA',${env.solanaCluster},${signature},'SUBMITTED',${JSON.stringify({destinationDomain:Number(intent.destination_domain),transferMode:String(intent.transfer_mode)})}::jsonb)`;
  return { intentId: id, status: 'BURN_SUBMITTED', signature };
}

function firstCircleMessage(payload: any) { return Array.isArray(payload?.messages) ? payload.messages[0] : Array.isArray(payload) ? payload[0] : payload?.message ?? null; }

export async function refreshCctpIntent(session: Session, id: string) {
  const intent = await load(session, id);
  if (!intent.source_tx) return intent;
  const response = await cctpMessages(Number(intent.source_domain), String(intent.source_tx));
  const message = firstCircleMessage(response);
  if (!message) {
    if (String(intent.status)==='BURN_SUBMITTED') await db()`UPDATE cctp_intents SET status='ATTESTING',attestation_status='pending',updated_at=now() WHERE id=${id}::uuid`;
    return { ...intent, status: String(intent.status)==='BURN_SUBMITTED'?'ATTESTING':intent.status, circle: response };
  }
  const attestation = message.attestation ?? message.attestationSignature ?? null;
  const messageHash = message.messageHash ?? message.hash ?? null;
  const destinationTx = message.destinationTxHash ?? message.destinationTransactionHash ?? null;
  const attested = Boolean(attestation && String(attestation).length > 10);
  const status = destinationTx ? 'RECONCILED' : attested ? 'ATTESTED' : 'ATTESTING';
  let destinationPayload: any = null;
  if (attested && env.cctpDestinationPrepareUrl) {
    destinationPayload = await integrationPost<any>('cctp-destination', env.cctpDestinationPrepareUrl, { intentId:id, sourceDomain:Number(intent.source_domain), destinationDomain:Number(intent.destination_domain), recipient:String(intent.recipient), message, attestation }, { headers: env.cctpDestinationPrepareApiKey ? { authorization:`Bearer ${env.cctpDestinationPrepareApiKey}` } : undefined });
  }
  await db()`UPDATE cctp_intents SET status=${status},message_hash=COALESCE(${messageHash},message_hash),attestation=COALESCE(${attestation},attestation),attestation_status=${attested?'complete':'pending'},destination_tx=COALESCE(${destinationTx},destination_tx),destination_prepare_payload=COALESCE(${destinationPayload?JSON.stringify(destinationPayload):null}::jsonb,destination_prepare_payload),updated_at=now() WHERE id=${id}::uuid`;
  return { ...(await load(session,id)), circle: response };
}

export async function listCctpIntents(session: Session, limit=50) {
  return db()`SELECT * FROM cctp_intents WHERE subject_id=${session.sub} ORDER BY created_at DESC LIMIT ${Math.max(1,Math.min(limit,100))}`;
}
