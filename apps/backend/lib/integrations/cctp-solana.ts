import 'server-only';
import bs58 from 'bs58';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { env, ConfigurationError } from '@/lib/server/config';
import { solanaConnection } from '@/lib/server/solana';
import { ApiError } from '@/lib/server/http';

const DIRECT_MINT_DISCRIMINATOR = Buffer.from([215, 60, 61, 46, 114, 55, 128, 176]);

function u32le(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new ApiError(400, 'INVALID_CCTP_DOMAIN', 'CCTP domain must fit in u32');
  const out = Buffer.alloc(4); out.writeUInt32LE(value); return out;
}
function u64le(value: bigint) {
  if (value < 0n || value > 0xffffffffffffffffn) throw new ApiError(400, 'INVALID_CCTP_AMOUNT', 'CCTP amount/fee exceeds u64');
  const out = Buffer.alloc(8); out.writeBigUInt64LE(value); return out;
}
function pda(programId: PublicKey, ...seeds: Buffer[]) {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

/** Normalize CCTP recipients to a 32-byte destination address. */
export function cctpRecipientBytes32(value: string) {
  const raw = value.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(raw)) return Buffer.concat([Buffer.alloc(12), Buffer.from(raw.slice(2), 'hex')]);
  if (/^0x[0-9a-fA-F]{1,64}$/.test(raw)) {
    const hex = raw.slice(2).padStart(64, '0');
    return Buffer.from(hex, 'hex');
  }
  try {
    const decoded = Buffer.from(bs58.decode(raw));
    if (decoded.length === 32) return decoded;
  } catch { /* handled below */ }
  throw new ApiError(400, 'INVALID_CCTP_RECIPIENT', 'CCTP recipient must be a 20-byte/32-byte hex address or a 32-byte base58 address');
}

export type PreparedCctpBurn = {
  transactionBase64: string;
  messageHashInput: Buffer;
  eventAccount: string;
  blockhash: string;
  lastValidBlockHeight: number;
  sourceTokenAccount: string;
  programIds: { messageTransmitter: string; tokenMessengerMinter: string };
};

export async function prepareCctpBurn(input: {
  owner: string;
  amountAtomic: bigint;
  destinationDomain: number;
  recipient: string;
  maxFeeAtomic: bigint;
  minFinalityThreshold: number;
}): Promise<PreparedCctpBurn> {
  if (!env.cctpUsdcMint) throw new ConfigurationError('CCTP_USDC_MINT is required');
  if (!env.cctpMessageTransmitterProgramId || !env.cctpTokenMessengerMinterProgramId) throw new ConfigurationError('CCTP V2 Solana program IDs are required');
  const connection = solanaConnection();
  const owner = new PublicKey(input.owner);
  const usdcMint = new PublicKey(env.cctpUsdcMint);
  const messageTransmitterProgram = new PublicKey(env.cctpMessageTransmitterProgramId);
  const tokenMessengerMinterProgram = new PublicKey(env.cctpTokenMessengerMinterProgramId);
  const destination = cctpRecipientBytes32(input.recipient);

  const sourceUsdc = getAssociatedTokenAddressSync(usdcMint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const sourceInfo = await connection.getAccountInfo(sourceUsdc, env.solanaCommitment);
  if (!sourceInfo) throw new ApiError(402, 'INSUFFICIENT_USDC', 'Authenticated wallet does not have the configured USDC token account');
  if (!sourceInfo.owner.equals(TOKEN_PROGRAM_ID)) throw new ApiError(409, 'USDC_TOKEN_PROGRAM_MISMATCH', 'Configured CCTP USDC account is not owned by the classic SPL Token program');
  const sourceAccount = await getAccount(connection, sourceUsdc, env.solanaCommitment, TOKEN_PROGRAM_ID);
  if (!sourceAccount.mint.equals(usdcMint)) throw new ApiError(409, 'USDC_MINT_MISMATCH', 'Source token account does not hold configured CCTP USDC');
  if (sourceAccount.amount < input.amountAtomic) throw new ApiError(402, 'INSUFFICIENT_USDC', 'USDC balance is insufficient for CCTP burn', { availableAtomic: sourceAccount.amount.toString(), requiredAtomic: input.amountAtomic.toString() });

  const senderAuthority = pda(tokenMessengerMinterProgram, Buffer.from('sender_authority'));
  const denylistAccount = pda(tokenMessengerMinterProgram, Buffer.from('denylist_account'), owner.toBuffer());
  const messageTransmitter = pda(messageTransmitterProgram, Buffer.from('message_transmitter'));
  const tokenMessenger = pda(tokenMessengerMinterProgram, Buffer.from('token_messenger'));
  const remoteTokenMessenger = pda(tokenMessengerMinterProgram, Buffer.from('remote_token_messenger'), Buffer.from(String(input.destinationDomain)));
  const tokenMinter = pda(tokenMessengerMinterProgram, Buffer.from('token_minter'));
  const localToken = pda(tokenMessengerMinterProgram, Buffer.from('local_token'), usdcMint.toBuffer());
  const tokenMessengerEventAuthority = pda(tokenMessengerMinterProgram, Buffer.from('__event_authority'));
  const messageTransmitterEventAuthority = pda(messageTransmitterProgram, Buffer.from('__event_authority'));
  const messageSentEvent = Keypair.generate();

  const instruction = new TransactionInstruction({
    programId: tokenMessengerMinterProgram,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: senderAuthority, isSigner: false, isWritable: false },
      { pubkey: sourceUsdc, isSigner: false, isWritable: true },
      { pubkey: denylistAccount, isSigner: false, isWritable: false },
      { pubkey: messageTransmitter, isSigner: false, isWritable: true },
      { pubkey: tokenMessenger, isSigner: false, isWritable: false },
      { pubkey: remoteTokenMessenger, isSigner: false, isWritable: false },
      { pubkey: tokenMinter, isSigner: false, isWritable: false },
      { pubkey: localToken, isSigner: false, isWritable: true },
      { pubkey: usdcMint, isSigner: false, isWritable: true },
      { pubkey: messageSentEvent.publicKey, isSigner: true, isWritable: true },
      { pubkey: messageTransmitterProgram, isSigner: false, isWritable: false },
      { pubkey: tokenMessengerMinterProgram, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenMessengerEventAuthority, isSigner: false, isWritable: false },
      { pubkey: tokenMessengerMinterProgram, isSigner: false, isWritable: false },
      { pubkey: messageTransmitterEventAuthority, isSigner: false, isWritable: false },
      { pubkey: messageTransmitterProgram, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      DIRECT_MINT_DISCRIMINATOR,
      u64le(input.amountAtomic),
      u32le(input.destinationDomain),
      destination,
      Buffer.alloc(32),
      u64le(input.maxFeeAtomic),
      u32le(input.minFinalityThreshold),
    ]),
  });

  const latest = await connection.getLatestBlockhash(env.solanaCommitment);
  const tx = new Transaction({ feePayer: owner, recentBlockhash: latest.blockhash }).add(instruction);
  tx.partialSign(messageSentEvent);
  return {
    transactionBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
    messageHashInput: tx.serializeMessage(),
    eventAccount: messageSentEvent.publicKey.toBase58(),
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    sourceTokenAccount: sourceUsdc.toBase58(),
    programIds: { messageTransmitter: messageTransmitterProgram.toBase58(), tokenMessengerMinter: tokenMessengerMinterProgram.toBase58() },
  };
}
