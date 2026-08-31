import 'server-only';
import crypto from 'node:crypto';
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { env, ConfigurationError } from './config';

export function anchorDiscriminator(name: string) {
  return crypto.createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

export function u64(value: bigint) {
  if (value < 0n || value > 0xffffffffffffffffn) throw new Error('u64 out of range');
  const out = Buffer.alloc(8); out.writeBigUInt64LE(value); return out;
}

export function u32(value: number) {
  const out = Buffer.alloc(4); out.writeUInt32LE(value); return out;
}

export function stringArg(value: string) {
  const bytes = Buffer.from(value, 'utf8');
  return Buffer.concat([u32(bytes.length), bytes]);
}

export function stakingProgram() {
  if (!env.stakingProgramId) throw new ConfigurationError('SOLANA_STAKING_PROGRAM_ID is required');
  return new PublicKey(env.stakingProgramId);
}

export function governanceProgram() {
  if (!env.governanceProgramId) throw new ConfigurationError('SOLANA_GOVERNANCE_PROGRAM_ID is required');
  return new PublicKey(env.governanceProgramId);
}

export function bondsProgram() {
  if (!env.bondsProgramId) throw new ConfigurationError('SOLANA_BONDS_PROGRAM_ID is required');
  return new PublicKey(env.bondsProgramId);
}

export function pwrcMint() {
  if (!env.pwrcMint) throw new ConfigurationError('PWRC_MINT is required');
  return new PublicKey(env.pwrcMint);
}

export function stakingPdas(owner: PublicKey, poolId: string, intentId: string) {
  const programId = stakingProgram();
  const [globalConfig] = PublicKey.findProgramAddressSync([Buffer.from('global-config')], programId);
  const [pool] = PublicKey.findProgramAddressSync([Buffer.from('pool'), Buffer.from(poolId)], programId);
  const [position] = PublicKey.findProgramAddressSync([Buffer.from('position'), owner.toBuffer(), seed32(intentId)], programId);
  const mint = pwrcMint();
  const userTokenAccount = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const derivedVault = getAssociatedTokenAddressSync(mint, globalConfig, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const stakingVault = env.stakingVaultTokenAccount ? new PublicKey(env.stakingVaultTokenAccount) : derivedVault;
  return { programId, globalConfig, pool, position, mint, userTokenAccount, stakingVault };
}

export function buildStakeInstruction(owner: PublicKey, intentId: string, poolId: string, amountAtomic: bigint) {
  const p = stakingPdas(owner, poolId, intentId);
  const data = Buffer.concat([anchorDiscriminator('stake'), u64(amountAtomic), stringArg(poolId), seed32(intentId), stringArg(intentId)]);
  return new TransactionInstruction({
    programId: p.programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: p.globalConfig, isSigner: false, isWritable: false },
      { pubkey: p.pool, isSigner: false, isWritable: true },
      { pubkey: p.position, isSigner: false, isWritable: true },
      { pubkey: p.userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: p.stakingVault, isSigner: false, isWritable: true },
      { pubkey: p.mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildPositionInstruction(action: 'increase_stake' | 'request_unstake' | 'cancel_unstake' | 'withdraw' | 'claim_rewards' | 'compound_rewards', owner: PublicKey, intentId: string, poolId: string, position: PublicKey, amountAtomic?: bigint) {
  const p = stakingPdas(owner, poolId, intentId);
  if (!env.rewardVaultTokenAccount) throw new ConfigurationError('PWRC_REWARD_VAULT_TOKEN_ACCOUNT is required for staking position actions');
  const rewardVault = new PublicKey(env.rewardVaultTokenAccount);
  const dataParts = [anchorDiscriminator(action)];
  if (amountAtomic != null && ['increase_stake','withdraw','claim_rewards','compound_rewards'].includes(action)) dataParts.push(u64(amountAtomic));
  dataParts.push(stringArg(intentId));
  return new TransactionInstruction({
    programId: p.programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: p.globalConfig, isSigner: false, isWritable: false },
      { pubkey: p.pool, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: p.userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: p.stakingVault, isSigner: false, isWritable: true },
      { pubkey: rewardVault, isSigner: false, isWritable: true },
      { pubkey: p.mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat(dataParts),
  });
}

function seed32(value: string) {
  return crypto.createHash('sha256').update(value).digest().subarray(0, 32);
}

export function governancePdas(proposalKey: string, voter?: PublicKey) {
  const programId = governanceProgram();
  const [config] = PublicKey.findProgramAddressSync([Buffer.from('governance-config')], programId);
  const [proposal] = PublicKey.findProgramAddressSync([Buffer.from('proposal'), seed32(proposalKey)], programId);
  const voterWeight = voter ? PublicKey.findProgramAddressSync([Buffer.from('voter-weight'), voter.toBuffer()], programId)[0] : null;
  const voteRecord = voter ? PublicKey.findProgramAddressSync([Buffer.from('vote'), proposal.toBuffer(), voter.toBuffer()], programId)[0] : null;
  return { programId, config, proposal, voterWeight, voteRecord };
}

export function buildGovernanceVoteInstruction(voter: PublicKey, proposalKey: string, choice: 'FOR' | 'AGAINST' | 'ABSTAIN') {
  const p = governancePdas(proposalKey, voter);
  const choiceCode = choice === 'FOR' ? 0 : choice === 'AGAINST' ? 1 : 2;
  return new TransactionInstruction({
    programId: p.programId,
    keys: [
      { pubkey: voter, isSigner: true, isWritable: false },
      { pubkey: p.config, isSigner: false, isWritable: false },
      { pubkey: p.proposal, isSigner: false, isWritable: true },
      { pubkey: p.voterWeight!, isSigner: false, isWritable: false },
      { pubkey: p.voteRecord!, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([anchorDiscriminator('vote'), Buffer.from([choiceCode])]),
  });
}

export function buildGovernanceExecuteInstruction(executor: PublicKey, proposalKey: string) {
  const p = governancePdas(proposalKey);
  return new TransactionInstruction({
    programId: p.programId,
    keys: [
      { pubkey: executor, isSigner: true, isWritable: false },
      { pubkey: p.config, isSigner: false, isWritable: true },
      { pubkey: p.proposal, isSigner: false, isWritable: true },
    ],
    data: anchorDiscriminator('execute_proposal'),
  });
}

export function bondPdas(owner: PublicKey, role: 'OPERATOR' | 'VERIFIER', serviceType: string) {
  const programId = bondsProgram();
  const [config] = PublicKey.findProgramAddressSync([Buffer.from('bonds-config')], programId);
  const [bond] = PublicKey.findProgramAddressSync([Buffer.from('bond'), Buffer.from(role.toLowerCase()), owner.toBuffer(), seed32(serviceType)], programId);
  const mint = pwrcMint();
  const ownerTokenAccount = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const vault = getAssociatedTokenAddressSync(mint, config, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  return { programId, config, bond, mint, ownerTokenAccount, vault };
}

export function buildBondInstruction(action: 'create_bond' | 'increase_bond' | 'request_unbond' | 'withdraw_bond', owner: PublicKey, role: 'OPERATOR' | 'VERIFIER', serviceType: string, amountAtomic?: bigint) {
  const p = bondPdas(owner, role, serviceType);
  const roleSeed = role.toLowerCase();
  const parts = [anchorDiscriminator(action), Buffer.from([role === 'OPERATOR' ? 0 : 1]), stringArg(roleSeed), seed32(serviceType), stringArg(serviceType)];
  if (amountAtomic != null) parts.push(u64(amountAtomic));
  return new TransactionInstruction({
    programId: p.programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: p.config, isSigner: false, isWritable: false },
      { pubkey: p.bond, isSigner: false, isWritable: true },
      { pubkey: p.ownerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: p.vault, isSigner: false, isWritable: true },
      { pubkey: p.mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat(parts),
  });
}

export function anchorAccountDiscriminator(name: string) {
  return crypto.createHash('sha256').update(`account:${name}`).digest().subarray(0, 8);
}

function readAnchorString(data: Buffer, offset: number) {
  if (offset + 4 > data.length) throw new Error('Anchor string length is out of bounds');
  const length = data.readUInt32LE(offset); offset += 4;
  if (length > 4096 || offset + length > data.length) throw new Error('Anchor string payload is out of bounds');
  return { value: data.subarray(offset, offset + length).toString('utf8'), offset: offset + length };
}

export function decodeStakingPositionAccount(data: Buffer) {
  const discriminator = anchorAccountDiscriminator('Position');
  if (data.length < 8 || !data.subarray(0, 8).equals(discriminator)) throw new Error('Invalid PowerChain staking Position discriminator');
  let offset = 8;
  const owner = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
  const pool = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
  const poolId = readAnchorString(data, offset); offset = poolId.offset;
  if (offset + 8 * 5 + 1 + 8 + 32 + 1 > data.length) throw new Error('PowerChain staking Position account is truncated');
  const principalAtomic = data.readBigUInt64LE(offset); offset += 8;
  const claimableRewardsAtomic = data.readBigUInt64LE(offset); offset += 8;
  const totalClaimedAtomic = data.readBigUInt64LE(offset); offset += 8;
  const lockEndsAt = data.readBigInt64LE(offset); offset += 8;
  const unbondingEndsAt = data.readBigInt64LE(offset); offset += 8;
  const statusCode = data.readUInt8(offset); offset += 1;
  const createdAt = data.readBigInt64LE(offset); offset += 8;
  const intentSeed = data.subarray(offset, offset + 32); offset += 32;
  const bump = data.readUInt8(offset);
  const statuses = ['ACTIVE', 'LOCKED', 'UNBONDING', 'CLOSED'] as const;
  const status = statuses[statusCode];
  if (!status) throw new Error(`Unknown staking Position status ${statusCode}`);
  return { owner, pool, poolId: poolId.value, principalAtomic, claimableRewardsAtomic, totalClaimedAtomic, lockEndsAt, unbondingEndsAt, status, createdAt, intentSeed, bump };
}

export function decodeBondAccount(data: Buffer) {
  const discriminator = anchorAccountDiscriminator('Bond');
  if (data.length < 8 || !data.subarray(0, 8).equals(discriminator)) throw new Error('Invalid PowerChain Bond discriminator');
  let offset = 8;
  const owner = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
  const roleCode = data.readUInt8(offset); offset += 1;
  const serviceHash = data.subarray(offset, offset + 32); offset += 32;
  const service = readAnchorString(data, offset); offset = service.offset;
  if (offset + 8 + 1 + 8 + 8 + 1 > data.length) throw new Error('PowerChain Bond account is truncated');
  const amountAtomic = data.readBigUInt64LE(offset); offset += 8;
  const statusCode = data.readUInt8(offset); offset += 1;
  const unbondingEndsAt = data.readBigInt64LE(offset); offset += 8;
  const createdAt = data.readBigInt64LE(offset); offset += 8;
  const bump = data.readUInt8(offset);
  const role = roleCode === 0 ? 'OPERATOR' : roleCode === 1 ? 'VERIFIER' : null;
  if (!role) throw new Error(`Unknown service Bond role ${roleCode}`);
  const statuses = ['ACTIVE', 'UNBONDING', 'WITHDRAWN', 'SLASHED'] as const;
  const status = statuses[statusCode];
  if (!status) throw new Error(`Unknown service Bond status ${statusCode}`);
  return { owner, role, serviceHash, serviceType: service.value, amountAtomic, status, unbondingEndsAt, createdAt, bump };
}
