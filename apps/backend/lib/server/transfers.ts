import 'server-only';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  calculateEpochFee,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  createTransferCheckedWithFeeAndTransferHookInstruction,
  createTransferCheckedWithFeeInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  getTransferFeeConfig,
  getTransferHook,
} from '@solana/spl-token';
import { db } from './db';
import { env, ConfigurationError } from './config';
import { ApiError } from './http';
import { canonicalJson, sha256 } from './crypto';
import { solanaConnection } from './solana';
import { pwrcMint } from './anchor';
import { requireValidPwrcMint } from './pwrc';
import { assertPreparedNotExpired, preparedExpiry } from './execution';
import { assertStateChangeSafety } from './safety-gate';

const POLICY_VERSION = 'PWRC-TRANSFER-1.0.0';
type Session = { sub: string; wallet: string; network: 'SOLANA' | 'SUI'; kind: 'EXTERNAL' | 'EMBEDDED' };

function destinationKey(value: string) {
  try { return new PublicKey(value); }
  catch { throw new ApiError(400, 'INVALID_DESTINATION', 'Destination must be a valid Solana address'); }
}

async function feeQuote(amountAtomic: bigint) {
  const connection = solanaConnection();
  const mint = await getMint(connection, pwrcMint(), env.solanaCommitment, TOKEN_2022_PROGRAM_ID);
  const config = getTransferFeeConfig(mint);
  if (!config) return { feeAtomic: 0n, netAtomic: amountAtomic, epoch: null, hasTransferHook: Boolean(getTransferHook(mint)) };
  const epochInfo = await connection.getEpochInfo(env.solanaCommitment);
  const feeAtomic = calculateEpochFee(config, BigInt(epochInfo.epoch), amountAtomic);
  return { feeAtomic, netAtomic: amountAtomic - feeAtomic, epoch: epochInfo.epoch, hasTransferHook: Boolean(getTransferHook(mint)) };
}

export async function createWalletTransferIntent(session: Session, input: { destination: string; amountAtomic: bigint; idempotencyKey: string }) {
  await assertStateChangeSafety('WALLET');
  if (session.network !== 'SOLANA') throw new ApiError(400, 'NETWORK_NOT_SUPPORTED', 'PWRC transfers are currently configured for Solana');
  if (!env.pwrcMint) throw new ConfigurationError('PWRC_MINT is required for PWRC transfers');
  await requireValidPwrcMint();
  const destination = destinationKey(input.destination);
  const owner = new PublicKey(session.wallet);
  if (destination.equals(owner)) throw new ApiError(400, 'SELF_TRANSFER_NOT_ALLOWED', 'Destination must be different from the active wallet');
  const fee = await feeQuote(input.amountAtomic);
  if (fee.netAtomic < 0n) throw new ApiError(400, 'TRANSFER_FEE_INVALID', 'Configured transfer fee exceeds the transfer amount');

  const request = { version: 1, network: 'SOLANA', wallet: session.wallet, destination: destination.toBase58(), amountAtomic: input.amountAtomic.toString() };
  const requestHash = sha256(canonicalJson(request));
  const quote = {
    ...request,
    cluster: env.solanaCluster,
    mint: env.pwrcMint,
    tokenProgram: TOKEN_2022_PROGRAM_ID.toBase58(),
    transferFeeAtomic: fee.feeAtomic.toString(),
    netAmountAtomic: fee.netAtomic.toString(),
    quotedEpoch: fee.epoch,
    transferHook: fee.hasTransferHook,
    policyVersion: POLICY_VERSION,
  };
  const quoteHash = sha256(canonicalJson(quote));
  const sql = db();
  const rows = await sql`
    INSERT INTO wallet_transfer_intents(subject_id,wallet_address,network,destination_owner,amount_atomic,transfer_fee_atomic,net_amount_atomic,idempotency_key,request_hash,quote_hash,policy_version,status)
    VALUES(${session.sub},${session.wallet},'SOLANA',${destination.toBase58()},${input.amountAtomic.toString()},${fee.feeAtomic.toString()},${fee.netAtomic.toString()},${input.idempotencyKey},${requestHash},${quoteHash},${POLICY_VERSION},'QUOTED')
    ON CONFLICT(subject_id,idempotency_key) DO NOTHING RETURNING *
  `;
  let intent = rows[0];
  if (!intent) {
    [intent] = await sql`SELECT * FROM wallet_transfer_intents WHERE subject_id=${session.sub} AND idempotency_key=${input.idempotencyKey} LIMIT 1`;
    if (!intent || String(intent.request_hash) !== requestHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for a different PWRC transfer');
  }
  return { intent, quote };
}

async function loadIntent(session: Session, intentId: string) {
  const [intent] = await db()`SELECT * FROM wallet_transfer_intents WHERE id=${intentId} AND subject_id=${session.sub} LIMIT 1`;
  if (!intent) throw new ApiError(404, 'INTENT_NOT_FOUND', 'PWRC transfer intent not found');
  if (String(intent.wallet_address) !== session.wallet) throw new ApiError(403, 'WALLET_MISMATCH', 'Transfer belongs to another wallet');
  return intent as Record<string, any>;
}

export async function prepareWalletTransferIntent(session: Session, intentId: string) {
  await assertStateChangeSafety('WALLET');
  const intent = await loadIntent(session, intentId);
  if (!['QUOTED', 'READY', 'AWAITING_SIGNATURE'].includes(String(intent.status))) throw new ApiError(409, 'INTENT_STATE_INVALID', `Cannot prepare transfer in ${intent.status}`);
  await requireValidPwrcMint();
  const connection = solanaConnection();
  const owner = new PublicKey(session.wallet);
  const destination = destinationKey(String(intent.destination_owner));
  const mintKey = pwrcMint();
  const sourceAta = getAssociatedTokenAddressSync(mintKey, owner, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const destinationAta = getAssociatedTokenAddressSync(mintKey, destination, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const amount = BigInt(String(intent.amount_atomic));
  const sourceInfo = await connection.getAccountInfo(sourceAta, env.solanaCommitment);
  if (!sourceInfo) throw new ApiError(402, 'INSUFFICIENT_PWRC', 'Authenticated wallet does not have a PWRC Token-2022 account', { availableAtomic: '0', requiredAtomic: amount.toString() });
  if (!sourceInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) throw new ApiError(409, 'PWRC_ACCOUNT_PROGRAM_MISMATCH', 'Source PWRC account is not owned by Token-2022');
  const sourceAccount = await getAccount(connection, sourceAta, env.solanaCommitment, TOKEN_2022_PROGRAM_ID);
  if (!sourceAccount.mint.equals(mintKey)) throw new ApiError(409, 'PWRC_ACCOUNT_MINT_MISMATCH', 'Source token account does not hold the configured PWRC mint');
  const available = sourceAccount.amount;
  if (available < amount) throw new ApiError(402, 'INSUFFICIENT_PWRC', 'PWRC token account balance is insufficient', { availableAtomic: available.toString(), requiredAtomic: amount.toString() });

  const currentFee = await feeQuote(amount);
  if (currentFee.feeAtomic !== BigInt(String(intent.transfer_fee_atomic))) {
    throw new ApiError(409, 'TRANSFER_FEE_CHANGED', 'PWRC transfer-fee policy changed after this quote. Create a new transfer intent.', {
      quotedFeeAtomic: String(intent.transfer_fee_atomic), currentFeeAtomic: currentFee.feeAtomic.toString(), currentNetAmountAtomic: currentFee.netAtomic.toString(),
    });
  }

  const mint = await getMint(connection, mintKey, env.solanaCommitment, TOKEN_2022_PROGRAM_ID);
  const feeConfig = getTransferFeeConfig(mint);
  const transferHook = getTransferHook(mint);
  const destinationInfo = await connection.getAccountInfo(destinationAta, env.solanaCommitment);
  if (destinationInfo) {
    if (!destinationInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) throw new ApiError(409, 'DESTINATION_ACCOUNT_PROGRAM_MISMATCH', 'Recipient PWRC account is not owned by Token-2022');
    const destinationAccount = await getAccount(connection, destinationAta, env.solanaCommitment, TOKEN_2022_PROGRAM_ID);
    if (!destinationAccount.mint.equals(mintKey)) throw new ApiError(409, 'DESTINATION_ACCOUNT_MINT_MISMATCH', 'Recipient token account does not hold the configured PWRC mint');
  }
  const latest = await connection.getLatestBlockhash(env.solanaCommitment);
  const tx = new Transaction({ feePayer: owner, recentBlockhash: latest.blockhash });
  if (!destinationInfo) tx.add(createAssociatedTokenAccountIdempotentInstruction(owner, destinationAta, destination, mintKey, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));

  if (feeConfig && transferHook) {
    tx.add(await createTransferCheckedWithFeeAndTransferHookInstruction(connection, sourceAta, mintKey, destinationAta, owner, amount, mint.decimals, currentFee.feeAtomic, [], env.solanaCommitment, TOKEN_2022_PROGRAM_ID));
  } else if (feeConfig) {
    tx.add(createTransferCheckedWithFeeInstruction(sourceAta, mintKey, destinationAta, owner, amount, mint.decimals, currentFee.feeAtomic, [], TOKEN_2022_PROGRAM_ID));
  } else if (transferHook) {
    tx.add(await createTransferCheckedWithTransferHookInstruction(connection, sourceAta, mintKey, destinationAta, owner, amount, mint.decimals, [], env.solanaCommitment, TOKEN_2022_PROGRAM_ID));
  } else {
    tx.add(createTransferCheckedInstruction(sourceAta, mintKey, destinationAta, owner, amount, mint.decimals, [], TOKEN_2022_PROGRAM_ID));
  }

  const message = tx.compileMessage();
  const feeResult = await connection.getFeeForMessage(message, env.solanaCommitment);
  const messageHash = sha256(tx.serializeMessage());
  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
  const expiresAt = preparedExpiry();
  await db()`
    UPDATE wallet_transfer_intents SET status='AWAITING_SIGNATURE',destination_token_account=${destinationAta.toBase58()},creates_destination_account=${!destinationInfo},
      estimated_network_fee_lamports=${feeResult.value ?? null},prepared_blockhash=${latest.blockhash},last_valid_block_height=${latest.lastValidBlockHeight},
      prepared_message_hash=${messageHash},prepared_expires_at=${expiresAt},updated_at=now() WHERE id=${intent.id}
  `;
  return {
    intentId: intent.id, status: 'AWAITING_SIGNATURE', transactionBase64: serialized, network: 'SOLANA', cluster: env.solanaCluster,
    blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight, messageHash, preparedExpiresAt: expiresAt.toISOString(),
    destinationOwner: destination.toBase58(), destinationTokenAccount: destinationAta.toBase58(), createsDestinationAccount: !destinationInfo,
    amountAtomic: amount.toString(), transferFeeAtomic: currentFee.feeAtomic.toString(), netAmountAtomic: currentFee.netAtomic.toString(), estimatedNetworkFeeLamports: feeResult.value ?? null,
  };
}

export async function submitWalletTransferIntent(session: Session, intentId: string, signedTransactionBase64: string) {
  await assertStateChangeSafety('WALLET');
  const intent = await loadIntent(session, intentId);
  if (!['AWAITING_SIGNATURE', 'SIGNED'].includes(String(intent.status))) throw new ApiError(409, 'INTENT_STATE_INVALID', `Cannot submit transfer in ${intent.status}`);
  assertPreparedNotExpired(intent.prepared_expires_at);
  let tx: Transaction;
  try { tx = Transaction.from(Buffer.from(signedTransactionBase64, 'base64')); }
  catch { throw new ApiError(400, 'INVALID_TRANSACTION', 'signedTransactionBase64 is not a valid Solana legacy transaction'); }
  const owner = new PublicKey(session.wallet);
  if (!tx.feePayer?.equals(owner)) throw new ApiError(400, 'FEE_PAYER_MISMATCH', 'Transaction fee payer does not match authenticated wallet');
  if (tx.recentBlockhash !== intent.prepared_blockhash) throw new ApiError(400, 'BLOCKHASH_MISMATCH', 'Transaction blockhash differs from prepared transaction');
  if (sha256(tx.serializeMessage()) !== intent.prepared_message_hash) throw new ApiError(400, 'TRANSACTION_MUTATED', 'Signed transaction message differs from the prepared transaction');
  const ownerSignature = tx.signatures.find((s) => s.publicKey.equals(owner))?.signature;
  if (!ownerSignature) throw new ApiError(400, 'SIGNATURE_MISSING', 'Authenticated wallet signature is missing');
  if (!tx.instructions.some((ix) => ix.programId.equals(TOKEN_2022_PROGRAM_ID))) throw new ApiError(400, 'PROGRAM_MISMATCH', 'PWRC Token-2022 transfer instruction is missing');
  const connection = solanaConnection();
  const currentBlockHeight = await connection.getBlockHeight(env.solanaCommitment);
  if (intent.last_valid_block_height != null && currentBlockHeight > Number(intent.last_valid_block_height)) throw new ApiError(409, 'PREPARED_TRANSACTION_EXPIRED', 'Prepared blockhash has expired; prepare the transfer again');
  const raw = tx.serialize({ requireAllSignatures: true, verifySignatures: true });
  const signature = await connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3, preflightCommitment: env.solanaCommitment });
  await db()`UPDATE wallet_transfer_intents SET status='SUBMITTED',submitted_signature=${signature},updated_at=now() WHERE id=${intent.id}`;
  return { intentId: intent.id, status: 'SUBMITTED', signature };
}

export async function getWalletTransferIntent(session: Session, id: string) { return loadIntent(session, id); }
export async function listWalletTransfers(session: Session, limit = 50) {
  return db()`SELECT * FROM wallet_transfer_intents WHERE subject_id=${session.sub} ORDER BY created_at DESC LIMIT ${Math.max(1, Math.min(limit, 100))}`;
}
