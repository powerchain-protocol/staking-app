import 'server-only';
import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { pools } from '@/lib/data';
import { db, type Sql } from './db';
import { env } from './config';
import { solanaConnection } from './solana';
import { bondPdas, bondsProgram, decodeBondAccount, decodeStakingPositionAccount, governanceProgram, stakingPdas, stakingProgram } from './anchor';
import { createImmutableReceipt } from './receipts';
import { postJournal } from './ledger';
import { crystallizePositionRewards, indexRewardEpochs, initializePositionRewardCursors, resumePositionRewardCursors, rewardVaultCoverage } from './rewards';
import { verifyBridgeReserves } from './bridge';
import { acquireLease, releaseLease } from './leases';
import { markWebhookProcessed, markWebhookFailed, pendingWebhookSignatures } from './webhooks';
import crypto from 'node:crypto';
import { tripGlobalCircuit } from './controls';

function n(value: unknown) { return BigInt(String(value ?? '0')); }

function tokenAccountDelta(parsed: any, tokenAccount: string) {
  const keys = parsed?.transaction?.message?.accountKeys ?? [];
  const index = keys.findIndex((entry: any) => String(entry?.pubkey?.toBase58?.() ?? entry?.pubkey ?? entry) === tokenAccount);
  if (index < 0) return null;
  const pre = (parsed?.meta?.preTokenBalances ?? []).find((row: any) => Number(row.accountIndex) === index);
  const post = (parsed?.meta?.postTokenBalances ?? []).find((row: any) => Number(row.accountIndex) === index);
  if (!pre && !post) return null;
  return n(post?.uiTokenAmount?.amount ?? '0') - n(pre?.uiTokenAmount?.amount ?? '0');
}

async function finalizedStakingPosition(address: string) {
  const key = new PublicKey(address);
  const info = await solanaConnection().getAccountInfo(key, 'finalized');
  if (!info || !info.owner.equals(stakingProgram())) throw new Error('Expected on-chain staking position account is unavailable or has the wrong owner');
  return decodeStakingPositionAccount(Buffer.from(info.data));
}

async function finalizedBond(address: string) {
  const key = new PublicKey(address);
  const info = await solanaConnection().getAccountInfo(key, 'finalized');
  if (!info || !info.owner.equals(bondsProgram())) throw new Error('Expected on-chain service bond account is unavailable or has the wrong owner');
  return decodeBondAccount(Buffer.from(info.data));
}

async function exception(sourceType: string, sourceId: string, code: string, message: string, details: Record<string, unknown> = {}, tx?: Sql) {
  const sql = tx ?? db();
  await sql`INSERT INTO reconciliation_exceptions(source_type,source_id,code,message,details) VALUES(${sourceType},${sourceId},${code},${message},${sql.json(details)})`;
}

async function finality(signature: string, expectedProgram: PublicKey, sourceType: string, sourceId: string) {
  const connection = solanaConnection();
  const [statusResponse, parsed] = await Promise.all([
    connection.getSignatureStatuses([signature], { searchTransactionHistory: true }),
    connection.getParsedTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 }).catch(() => null),
  ]);
  const status = statusResponse.value[0];
  await db()`INSERT INTO transaction_observations(network,signature,source_type,source_id,confirmation_status,slot,error,expected_program,observed_program,block_time)
    VALUES('SOLANA',${signature},${sourceType},${sourceId},${status?.confirmationStatus ?? null},${parsed?.slot ?? null},${status?.err ? db().json(status.err as any) : null},${expectedProgram.toBase58()},${parsed ? parsed.transaction.message.accountKeys.some((x)=>x.pubkey.equals(expectedProgram)) : null},${parsed?.blockTime ? new Date(parsed.blockTime*1000) : null})`;
  if (!status) return { state: 'NOT_FOUND' as const, parsed: null };
  if (status.err) return { state: 'FAILED' as const, parsed, error: status.err };
  if (status.confirmationStatus !== 'finalized') return { state: 'CONFIRMING' as const, parsed: null };
  if (!parsed) return { state: 'FINALIZED_TX_UNAVAILABLE' as const, parsed: null };
  if (parsed.meta?.err) return { state: 'FAILED' as const, parsed, error: parsed.meta.err };
  const accountKeys = parsed.transaction.message.accountKeys.map((x) => x.pubkey.toBase58());
  if (!accountKeys.includes(expectedProgram.toBase58())) return { state: 'PROGRAM_MISMATCH' as const, parsed };
  return { state: 'FINALIZED' as const, parsed };
}

function positionStatus(lockDays: number | null) { return lockDays ? 'LOCKED' : 'ACTIVE'; }

async function settleRewardQuote(intent: Record<string, any>, tx: Sql) {
  const quote = intent.reward_quote as { byEpoch?: Array<{ epochId: string; claimableAtomic: string }> } | null;
  const total = n(intent.authoritative_reward_atomic);
  if (!quote?.byEpoch || total <= 0n) return 0n;

  const positive = quote.byEpoch.filter((row) => n(row.claimableAtomic) > 0n);
  const uniqueEpochs = new Set(positive.map((row) => row.epochId));
  if (uniqueEpochs.size !== positive.length) throw new Error('Reward quote contains duplicate epoch allocations');
  const allocated = positive.reduce((sum, row) => sum + n(row.claimableAtomic), 0n);
  if (allocated !== total) throw new Error(`Reward quote allocation mismatch: expected ${total}, allocated ${allocated}`);

  for (const row of positive) {
    const amount = n(row.claimableAtomic);
    const updated = await tx`
      UPDATE position_reward_cursors
      SET claimed_atomic=(claimed_atomic::numeric + ${amount.toString()}::numeric),updated_at=now()
      WHERE position_id=${intent.position_id} AND epoch_id=${row.epochId}
        AND (claimed_atomic::numeric + ${amount.toString()}::numeric) <= accrued_atomic::numeric
      RETURNING position_id
    `;
    if (updated.length !== 1) throw new Error(`Reward cursor settlement failed for epoch ${row.epochId}`);
  }
  return total;
}

async function reconcileStakingIntent(intent: Record<string, any>) {
  const signature = String(intent.submitted_signature);
  const state = await finality(signature, stakingProgram(), 'STAKING_INTENT', String(intent.id));
  if (state.state === 'NOT_FOUND' || state.state === 'CONFIRMING') {
    await db()`UPDATE staking_intents SET status='CONFIRMING',updated_at=now() WHERE id=${intent.id}`;
    return { processed: 0, exception: 0 };
  }
  if (state.state !== 'FINALIZED') {
    await db()`UPDATE staking_intents SET status=${state.state === 'FAILED' ? 'FAILED' : 'REQUIRES_REVIEW'},error_code=${state.state},error_message=${JSON.stringify((state as any).error ?? null)},updated_at=now() WHERE id=${intent.id}`;
    await exception('STAKING_INTENT', String(intent.id), state.state, 'Staking transaction could not be reconciled', { signature });
    return { processed: 0, exception: 1 };
  }

  const blockTime = state.parsed!.blockTime ? new Date(state.parsed!.blockTime * 1000) : new Date();
  const sql = db();
  await sql.begin(async (tx) => {
    const pool = pools.find((p) => p.id === intent.pool_id);
    if (intent.action === 'STAKE') {
      if (!pool) throw new Error(`Unknown pool ${intent.pool_id}`);
      const owner = new PublicKey(intent.wallet_address);
      const pdas = stakingPdas(owner, intent.pool_id, intent.id);
      const chainPosition = await solanaConnection().getAccountInfo(pdas.position, 'finalized');
      if (!chainPosition || !chainPosition.owner.equals(stakingProgram())) throw new Error('Expected on-chain staking position account was not created by the configured staking program');
      const chainState = decodeStakingPositionAccount(Buffer.from(chainPosition.data));
      if (!chainState.owner.equals(owner) || !chainState.pool.equals(pdas.pool) || chainState.poolId !== String(intent.pool_id)) throw new Error('On-chain staking position identity does not match the finalized intent');
      const requested = n(intent.amount_atomic);
      const principal = chainState.principalAtomic;
      if (principal <= 0n || principal > requested) throw new Error('On-chain staking principal is outside the finalized Token-2022 transfer amount');
      const transferFee = requested - principal;
      const weight = principal * BigInt(Math.round(pool.weightValue * 10_000)) / 10_000n;
      const unlock = pool.lockDays ? new Date(blockTime.getTime() + pool.lockDays * 86_400_000) : null;
      const [position] = await tx`
        INSERT INTO staking_positions(source_intent_id,subject_id,wallet_address,network,pool_id,principal_atomic,effective_weight_atomic,reward_index_entry,status,policy_version,lock_started_at,unlock_at,onchain_address,created_signature)
        VALUES(${intent.id},${intent.subject_id},${intent.wallet_address},'SOLANA',${intent.pool_id},${principal.toString()},${weight.toString()},0,${positionStatus(pool.lockDays)},${intent.policy_version},${blockTime},${unlock},${pdas.position.toBase58()},${signature})
        ON CONFLICT(source_intent_id) DO UPDATE SET updated_at=staking_positions.updated_at
        RETURNING *
      `;
      await tx`UPDATE staking_intents SET position_id=${position.id},status='RECONCILED',finalized_at=${blockTime},reconciled_at=now(),updated_at=now() WHERE id=${intent.id}`;
      await initializePositionRewardCursors(String(position.id), intent.pool_id, tx as Sql);
      const stakeLines: Array<{subjectId?:string|null;accountCode:string;amountAtomic:bigint}> = [
        { subjectId: intent.subject_id, accountCode: 'USER_AVAILABLE_PWRC', amountAtomic: -requested },
        { subjectId: intent.subject_id, accountCode: 'USER_STAKED_PWRC', amountAtomic: principal },
      ];
      if (transferFee > 0n) stakeLines.push({ accountCode: 'PWRC_TRANSFER_FEE_WITHHELD', amountAtomic: transferFee });
      await postJournal({ sourceType: 'STAKE', sourceId: String(intent.id), lines: stakeLines }, tx as Sql);
      await createImmutableReceipt({ subjectId: intent.subject_id, receiptType: 'STAKING_ACTION', sourceId: String(intent.id), chainSignature: signature, payload: { action: 'STAKE', intentId: intent.id, positionId: position.id, wallet: intent.wallet_address, poolId: intent.pool_id, requestedAmountAtomic: requested.toString(), principalAtomic: principal.toString(), transferFeeAtomic: transferFee.toString(), policyVersion: intent.policy_version, finalizedAt: blockTime.toISOString() } }, tx as Sql);
      return;
    }

    const [position] = await tx`SELECT * FROM staking_positions WHERE id=${intent.position_id} AND subject_id=${intent.subject_id} FOR UPDATE`;
    if (!position) throw new Error('Position missing during reconciliation');
    const amount = n(intent.amount_atomic);
    const currentPool = pools.find((p) => p.id === position.pool_id);
    if (!currentPool) throw new Error(`Unknown pool ${position.pool_id}`);
    if (!position.onchain_address) throw new Error('Position is missing its reconciled on-chain address');
    const chainState = await finalizedStakingPosition(String(position.onchain_address));
    if (!chainState.owner.equals(new PublicKey(intent.wallet_address)) || chainState.poolId !== String(position.pool_id)) throw new Error('On-chain staking position identity does not match reconciled database state');

    if (['INCREASE','REQUEST_UNSTAKE','CLAIM','COMPOUND'].includes(intent.action)) await crystallizePositionRewards(String(position.id), tx as Sql);

    if (intent.action === 'INCREASE') {
      const previousPrincipal = n(position.principal_atomic);
      const nextPrincipal = chainState.principalAtomic;
      const principalAdded = nextPrincipal - previousPrincipal;
      if (principalAdded <= 0n || principalAdded > amount) throw new Error('On-chain stake increase does not match the finalized Token-2022 transfer');
      const transferFee = amount - principalAdded;
      const nextWeight = nextPrincipal * BigInt(Math.round(currentPool.weightValue * 10_000)) / 10_000n;
      await tx`UPDATE staking_positions SET principal_atomic=${nextPrincipal.toString()},effective_weight_atomic=${nextWeight.toString()},updated_at=now() WHERE id=${position.id}`;
      const increaseLines: Array<{subjectId?:string|null;accountCode:string;amountAtomic:bigint}> = [
        { subjectId: intent.subject_id, accountCode: 'USER_AVAILABLE_PWRC', amountAtomic: -amount },
        { subjectId: intent.subject_id, accountCode: 'USER_STAKED_PWRC', amountAtomic: principalAdded },
      ];
      if (transferFee > 0n) increaseLines.push({ accountCode: 'PWRC_TRANSFER_FEE_WITHHELD', amountAtomic: transferFee });
      await postJournal({ sourceType: 'STAKE_INCREASE', sourceId: String(intent.id), lines: increaseLines }, tx as Sql);
    } else if (intent.action === 'REQUEST_UNSTAKE') {
      if (chainState.status !== 'UNBONDING') throw new Error(`On-chain position did not enter UNBONDING; observed ${chainState.status}`);
      const unbondingEnd = new Date(Number(chainState.unbondingEndsAt) * 1000);
      await tx`UPDATE staking_positions SET status='UNBONDING',unbonding_ends_at=${unbondingEnd},updated_at=now() WHERE id=${position.id}`;
    } else if (intent.action === 'CANCEL_UNSTAKE') {
      if (chainState.status !== 'ACTIVE') throw new Error(`On-chain position did not return to ACTIVE; observed ${chainState.status}`);
      const nextStatus = position.unlock_at && new Date(position.unlock_at) > blockTime ? 'LOCKED' : 'ACTIVE';
      await tx`UPDATE staking_positions SET status=${nextStatus},unbonding_ends_at=NULL,updated_at=now() WHERE id=${position.id}`;
      await resumePositionRewardCursors(String(position.id), position.pool_id, tx as Sql);
    } else if (intent.action === 'WITHDRAW') {
      const principal = n(position.principal_atomic);
      if (chainState.status !== 'CLOSED' || chainState.principalAtomic !== 0n) throw new Error('On-chain staking position was not fully closed by the finalized withdrawal');
      const owner = new PublicKey(intent.wallet_address);
      const pdas = stakingPdas(owner, String(position.pool_id), String(intent.id));
      const delta = tokenAccountDelta(state.parsed, pdas.userTokenAccount.toBase58());
      if (delta == null || delta <= 0n || delta > principal) throw new Error('Finalized withdrawal does not contain a valid PWRC credit to the authenticated wallet');
      const transferFee = principal - delta;
      await tx`UPDATE staking_positions SET status='WITHDRAWN',principal_atomic=0,effective_weight_atomic=0,updated_at=now() WHERE id=${position.id}`;
      const withdrawLines: Array<{subjectId?:string|null;accountCode:string;amountAtomic:bigint}> = [
        { subjectId: intent.subject_id, accountCode: 'USER_STAKED_PWRC', amountAtomic: -principal },
        { subjectId: intent.subject_id, accountCode: 'USER_AVAILABLE_PWRC', amountAtomic: delta },
      ];
      if (transferFee > 0n) withdrawLines.push({ accountCode: 'PWRC_TRANSFER_FEE_WITHHELD', amountAtomic: transferFee });
      await postJournal({ sourceType: 'WITHDRAW', sourceId: String(intent.id), lines: withdrawLines }, tx as Sql);
    } else if (intent.action === 'CLAIM' || intent.action === 'COMPOUND') {
      const reward = await settleRewardQuote(intent, tx as Sql);
      if (reward <= 0n) throw new Error('Claim intent has no authoritative reward amount');
      let [claim]=await tx`INSERT INTO reward_claims(staking_intent_id,position_id,amount_atomic,signature,status,settled_at) VALUES(${intent.id},${position.id},${reward.toString()},${signature},'SETTLED',now()) ON CONFLICT(staking_intent_id) DO NOTHING RETURNING *`;
      if(!claim)[claim]=await tx`SELECT * FROM reward_claims WHERE staking_intent_id=${intent.id} LIMIT 1`;
      const allocations=(intent.reward_quote as {byEpoch?:Array<{epochId:string;claimableAtomic:string}>}|null)?.byEpoch??[];
      for(const allocation of allocations){const allocationAmount=n(allocation.claimableAtomic);if(allocationAmount<=0n)continue;await tx`INSERT INTO reward_claim_allocations(claim_id,epoch_id,amount_atomic) VALUES(${claim.id},${allocation.epochId},${allocationAmount.toString()}) ON CONFLICT(claim_id,epoch_id) DO NOTHING`;}
      if (intent.action === 'COMPOUND') {
        const previousPrincipal = n(position.principal_atomic);
        const nextPrincipal = chainState.principalAtomic;
        const principalAdded = nextPrincipal - previousPrincipal;
        if (principalAdded <= 0n || principalAdded > reward) throw new Error('On-chain compound principal does not match the authoritative reward transfer');
        const transferFee = reward - principalAdded;
        const nextWeight = nextPrincipal * BigInt(Math.round(currentPool.weightValue * 10_000)) / 10_000n;
        await tx`UPDATE staking_positions SET principal_atomic=${nextPrincipal.toString()},effective_weight_atomic=${nextWeight.toString()},updated_at=now() WHERE id=${position.id}`;
        const compoundLines: Array<{subjectId?:string|null;accountCode:string;amountAtomic:bigint}> = [
          { subjectId: intent.subject_id, accountCode: 'STAKING_REWARD_LIABILITY', amountAtomic: reward },
          { subjectId: intent.subject_id, accountCode: 'USER_STAKED_PWRC', amountAtomic: -principalAdded },
        ];
        if (transferFee > 0n) compoundLines.push({ accountCode: 'PWRC_TRANSFER_FEE_WITHHELD', amountAtomic: -transferFee });
        await postJournal({ sourceType: 'REWARD_COMPOUND', sourceId: String(intent.id), lines: compoundLines }, tx as Sql);
      } else {
        if (chainState.principalAtomic !== n(position.principal_atomic)) throw new Error('Reward claim unexpectedly changed on-chain staking principal');
        const owner = new PublicKey(intent.wallet_address);
        const pdas = stakingPdas(owner, String(position.pool_id), String(intent.id));
        const netReceived = tokenAccountDelta(state.parsed, pdas.userTokenAccount.toBase58());
        if (netReceived == null || netReceived <= 0n || netReceived > reward) throw new Error('Finalized reward claim does not contain a valid PWRC wallet credit');
        const transferFee = reward - netReceived;
        const claimLines: Array<{subjectId?:string|null;accountCode:string;amountAtomic:bigint}> = [
          { subjectId: intent.subject_id, accountCode: 'STAKING_REWARD_LIABILITY', amountAtomic: reward },
          { subjectId: intent.subject_id, accountCode: 'USER_AVAILABLE_PWRC', amountAtomic: -netReceived },
        ];
        if (transferFee > 0n) claimLines.push({ accountCode: 'PWRC_TRANSFER_FEE_WITHHELD', amountAtomic: -transferFee });
        await postJournal({ sourceType: 'REWARD_CLAIM', sourceId: String(intent.id), lines: claimLines }, tx as Sql);
      }
    }

    await tx`UPDATE staking_intents SET status='RECONCILED',finalized_at=${blockTime},reconciled_at=now(),updated_at=now() WHERE id=${intent.id}`;
    await createImmutableReceipt({ subjectId: intent.subject_id, receiptType: 'STAKING_ACTION', sourceId: String(intent.id), chainSignature: signature, payload: { action: intent.action, intentId: intent.id, positionId: position.id, wallet: intent.wallet_address, amountAtomic: intent.amount_atomic ? String(intent.amount_atomic) : null, rewardAtomic: intent.authoritative_reward_atomic ? String(intent.authoritative_reward_atomic) : null, policyVersion: intent.policy_version, finalizedAt: blockTime.toISOString() } }, tx as Sql);
  });
  return { processed: 1, exception: 0 };
}

async function reconcileGovernanceIntent(intent: Record<string, any>) {
  const signature = String(intent.submitted_signature);
  const state = await finality(signature, governanceProgram(), 'GOVERNANCE_INTENT', String(intent.id));
  if (state.state === 'NOT_FOUND' || state.state === 'CONFIRMING') { await db()`UPDATE governance_intents SET status='CONFIRMING',updated_at=now() WHERE id=${intent.id}`; return { processed: 0, exception: 0 }; }
  if (state.state !== 'FINALIZED') { await db()`UPDATE governance_intents SET status=${state.state === 'FAILED' ? 'FAILED' : 'REQUIRES_REVIEW'},updated_at=now() WHERE id=${intent.id}`; await exception('GOVERNANCE_INTENT', String(intent.id), state.state, 'Governance transaction could not be reconciled', { signature }); return { processed: 0, exception: 1 }; }
  await db().begin(async (tx) => {
    const [proposal] = await tx`SELECT * FROM governance_proposals WHERE id=${intent.proposal_id} FOR UPDATE`;
    if (!proposal) throw new Error('Governance proposal missing during reconciliation');
    if (intent.action === 'VOTE') {
      const weight = n(intent.voting_weight_atomic);
      const inserted=await tx`INSERT INTO governance_votes(proposal_id,subject_id,wallet_address,choice,weight_atomic,signature) VALUES(${proposal.id},${intent.subject_id},${intent.wallet_address},${intent.choice},${weight.toString()},${signature}) ON CONFLICT(proposal_id,wallet_address) DO NOTHING RETURNING id`;
      if(inserted.length){
        const column=intent.choice==='FOR'?'for_weight_atomic':intent.choice==='AGAINST'?'against_weight_atomic':'abstain_weight_atomic';
        await tx.unsafe(`UPDATE governance_proposals SET ${column}=(${column}::numeric + $1::numeric),updated_at=now() WHERE id=$2`,[weight.toString(),proposal.id]);
      }
    } else {
      await tx`UPDATE governance_proposals SET status='EXECUTED',execute_signature=${signature},executed_at=now(),updated_at=now() WHERE id=${proposal.id}`;
    }
    await tx`UPDATE governance_intents SET status='RECONCILED',updated_at=now() WHERE id=${intent.id}`;
    await createImmutableReceipt({ subjectId: intent.subject_id, receiptType: 'GOVERNANCE_ACTION', sourceId: String(intent.id), chainSignature: signature, payload: { action: intent.action, proposalId: proposal.id, onchainProposalId: proposal.onchain_proposal_id, choice: intent.choice ?? null, votingWeightAtomic: String(intent.voting_weight_atomic ?? 0) } }, tx as Sql);
  });
  return { processed: 1, exception: 0 };
}

async function reconcileBondIntent(intent: Record<string, any>) {
  const signature = String(intent.submitted_signature);
  const state = await finality(signature, bondsProgram(), 'BOND_INTENT', String(intent.id));
  if (state.state === 'NOT_FOUND' || state.state === 'CONFIRMING') { await db()`UPDATE service_bond_intents SET status='CONFIRMING',updated_at=now() WHERE id=${intent.id}`; return { processed: 0, exception: 0 }; }
  if (state.state !== 'FINALIZED') { await db()`UPDATE service_bond_intents SET status=${state.state === 'FAILED' ? 'FAILED' : 'REQUIRES_REVIEW'},updated_at=now() WHERE id=${intent.id}`; await exception('BOND_INTENT', String(intent.id), state.state, 'Bond transaction could not be reconciled', { signature }); return { processed: 0, exception: 1 }; }
  const blockTime = state.parsed!.blockTime ? new Date(state.parsed!.blockTime * 1000) : new Date();
  await db().begin(async (tx) => {
    const amount = n(intent.amount_atomic);
    let bond: any = null;
    if (intent.action === 'BOND') {
      const owner = new PublicKey(intent.wallet_address);
      const p = bondPdas(owner, intent.role, intent.service_type);
      const account = await solanaConnection().getAccountInfo(p.bond, 'finalized');
      if (!account || !account.owner.equals(bondsProgram())) throw new Error('Expected on-chain bond account not found');
      const chainBond = decodeBondAccount(Buffer.from(account.data));
      if (!chainBond.owner.equals(owner) || chainBond.role !== intent.role || chainBond.serviceType !== String(intent.service_type)) throw new Error('On-chain service bond identity does not match finalized intent');
      const bonded = chainBond.amountAtomic;
      if (bonded <= 0n || bonded > amount) throw new Error('On-chain service bond amount is outside the finalized Token-2022 transfer amount');
      const transferFee = amount - bonded;
      [bond] = await tx`
        INSERT INTO service_bonds(source_intent_id,subject_id,wallet_address,role,service_type,amount_atomic,status,slashable,policy_version,onchain_address,created_signature)
        VALUES(${intent.id},${intent.subject_id},${intent.wallet_address},${intent.role},${intent.service_type},${bonded.toString()},'ACTIVE',true,${intent.policy_version},${p.bond.toBase58()},${signature})
        ON CONFLICT(source_intent_id) DO UPDATE SET updated_at=service_bonds.updated_at RETURNING *
      `;
      await tx`UPDATE service_bond_intents SET bond_id=${bond.id} WHERE id=${intent.id}`;
      const bondLines: Array<{subjectId?:string|null;accountCode:string;amountAtomic:bigint}> = [
        { subjectId: intent.subject_id, accountCode: 'USER_AVAILABLE_PWRC', amountAtomic: -amount },
        { subjectId: intent.subject_id, accountCode: `${intent.role}_BOND_PWRC`, amountAtomic: bonded },
      ];
      if (transferFee > 0n) bondLines.push({ accountCode: 'PWRC_TRANSFER_FEE_WITHHELD', amountAtomic: transferFee });
      await postJournal({ sourceType: `${intent.role}_BOND`, sourceId: String(intent.id), lines: bondLines }, tx as Sql);
    } else {
      [bond] = await tx`SELECT * FROM service_bonds WHERE id=${intent.bond_id} AND subject_id=${intent.subject_id} FOR UPDATE`;
      if (!bond) throw new Error('Bond missing during reconciliation');
      if (!bond.onchain_address) throw new Error('Bond is missing its reconciled on-chain address');
      const chainBond = await finalizedBond(String(bond.onchain_address));
      if (!chainBond.owner.equals(new PublicKey(intent.wallet_address)) || chainBond.role !== intent.role || chainBond.serviceType !== String(intent.service_type)) throw new Error('On-chain service bond identity does not match reconciled database state');
      if (intent.action === 'INCREASE') {
        const previous = n(bond.amount_atomic);
        const next = chainBond.amountAtomic;
        const bondedAdded = next - previous;
        if (bondedAdded <= 0n || bondedAdded > amount) throw new Error('On-chain bond increase does not match the finalized Token-2022 transfer');
        const transferFee = amount - bondedAdded;
        await tx`UPDATE service_bonds SET amount_atomic=${next.toString()},updated_at=now() WHERE id=${bond.id}`;
        const increaseLines: Array<{subjectId?:string|null;accountCode:string;amountAtomic:bigint}> = [
          { subjectId: intent.subject_id, accountCode: 'USER_AVAILABLE_PWRC', amountAtomic: -amount },
          { subjectId: intent.subject_id, accountCode: `${intent.role}_BOND_PWRC`, amountAtomic: bondedAdded },
        ];
        if (transferFee > 0n) increaseLines.push({ accountCode: 'PWRC_TRANSFER_FEE_WITHHELD', amountAtomic: transferFee });
        await postJournal({ sourceType: `${intent.role}_BOND_INCREASE`, sourceId: String(intent.id), lines: increaseLines }, tx as Sql);
      } else if (intent.action === 'REQUEST_UNBOND') {
        if (chainBond.status !== 'UNBONDING') throw new Error(`On-chain service bond did not enter UNBONDING; observed ${chainBond.status}`);
        const unbondingEnd=new Date(Number(chainBond.unbondingEndsAt)*1000);
        await tx`UPDATE service_bonds SET status='UNBONDING',unbonding_ends_at=${unbondingEnd},updated_at=now() WHERE id=${bond.id}`;
      } else if (intent.action === 'WITHDRAW') {
        const principal = n(bond.amount_atomic);
        if (chainBond.status !== 'WITHDRAWN' || chainBond.amountAtomic !== 0n) throw new Error('On-chain service bond was not fully withdrawn');
        const p = bondPdas(new PublicKey(intent.wallet_address), intent.role, intent.service_type);
        const netReceived = tokenAccountDelta(state.parsed, p.ownerTokenAccount.toBase58());
        if (netReceived == null || netReceived <= 0n || netReceived > principal) throw new Error('Finalized bond withdrawal does not contain a valid PWRC wallet credit');
        const transferFee = principal - netReceived;
        await tx`UPDATE service_bonds SET status='WITHDRAWN',amount_atomic=0,unbonding_ends_at=NULL,updated_at=now() WHERE id=${bond.id}`;
        const withdrawLines: Array<{subjectId?:string|null;accountCode:string;amountAtomic:bigint}> = [
          { subjectId: intent.subject_id, accountCode: `${intent.role}_BOND_PWRC`, amountAtomic: -principal },
          { subjectId: intent.subject_id, accountCode: 'USER_AVAILABLE_PWRC', amountAtomic: netReceived },
        ];
        if (transferFee > 0n) withdrawLines.push({ accountCode: 'PWRC_TRANSFER_FEE_WITHHELD', amountAtomic: transferFee });
        await postJournal({ sourceType: `${intent.role}_BOND_WITHDRAW`, sourceId: String(intent.id), lines: withdrawLines }, tx as Sql);
      }
    }
    await tx`UPDATE service_bond_intents SET status='RECONCILED',updated_at=now() WHERE id=${intent.id}`;
    await createImmutableReceipt({ subjectId: intent.subject_id, receiptType: 'SERVICE_BOND_ACTION', sourceId: String(intent.id), chainSignature: signature, payload: { action: intent.action, role: intent.role, serviceType: intent.service_type, bondId: bond?.id ?? intent.bond_id, amountAtomic: intent.amount_atomic ? String(intent.amount_atomic) : null, policyVersion: intent.policy_version } }, tx as Sql);
  });
  return { processed: 1, exception: 0 };
}


async function reconcileWalletTransferIntent(intent: Record<string, any>) {
  const signature = String(intent.submitted_signature);
  const state = await finality(signature, TOKEN_2022_PROGRAM_ID, 'WALLET_TRANSFER_INTENT', String(intent.id));
  if (state.state === 'NOT_FOUND' || state.state === 'CONFIRMING') {
    await db()`UPDATE wallet_transfer_intents SET status='CONFIRMING',updated_at=now() WHERE id=${intent.id}`;
    return { processed: 0, exception: 0 };
  }
  if (state.state !== 'FINALIZED') {
    await db()`UPDATE wallet_transfer_intents SET status=${state.state === 'FAILED' ? 'FAILED' : 'REQUIRES_REVIEW'},error_code=${state.state},error_message=${JSON.stringify((state as any).error ?? null)},updated_at=now() WHERE id=${intent.id}`;
    await exception('WALLET_TRANSFER_INTENT', String(intent.id), state.state, 'PWRC transfer could not be reconciled', { signature });
    return { processed: 0, exception: 1 };
  }
  const blockTime = state.parsed!.blockTime ? new Date(state.parsed!.blockTime * 1000) : new Date();
  const amount = n(intent.amount_atomic);
  const fee = n(intent.transfer_fee_atomic);
  const net = n(intent.net_amount_atomic);
  if (net + fee !== amount) throw new Error('PWRC transfer accounting does not balance to the quoted amount');
  await db().begin(async (tx) => {
    const lines: Array<{subjectId?:string|null;accountCode:string;amountAtomic:bigint;metadata?:Record<string,unknown>}> = [
      { subjectId: intent.subject_id, accountCode: 'USER_AVAILABLE_PWRC', amountAtomic: -amount },
      { accountCode: 'EXTERNAL_PWRC_RECIPIENT', amountAtomic: net, metadata: { destination: intent.destination_owner } },
    ];
    if (fee > 0n) lines.push({ accountCode: 'PWRC_TRANSFER_FEE_WITHHELD', amountAtomic: fee });
    await postJournal({ sourceType: 'PWRC_TRANSFER', sourceId: String(intent.id), lines }, tx as Sql);
    await tx`UPDATE wallet_transfer_intents SET status='RECONCILED',finalized_at=${blockTime},reconciled_at=now(),updated_at=now() WHERE id=${intent.id}`;
    await createImmutableReceipt({
      subjectId: intent.subject_id,
      receiptType: 'PWRC_TRANSFER',
      sourceId: String(intent.id),
      chainSignature: signature,
      payload: {
        wallet: intent.wallet_address,
        destination: intent.destination_owner,
        destinationTokenAccount: intent.destination_token_account,
        amountAtomic: amount.toString(),
        transferFeeAtomic: fee.toString(),
        netAmountAtomic: net.toString(),
        createsDestinationAccount: Boolean(intent.creates_destination_account),
        policyVersion: intent.policy_version,
        finalizedAt: blockTime.toISOString(),
      },
    }, tx as Sql);
  });
  return { processed: 1, exception: 0 };
}

const TABLES={staking:'staking_intents',governance:'governance_intents',bond:'service_bond_intents',transfer:'wallet_transfer_intents'} as const;
type IntentKind=keyof typeof TABLES;

async function claimIntent(kind:IntentKind,id:string){
  const table=TABLES[kind];
  const staleBefore=new Date(Date.now()-env.reconciliationLeaseSeconds*1000);
  const rows=await db().unsafe(`UPDATE ${table} SET status='RECONCILING',reconciliation_claimed_at=now(),updated_at=now() WHERE id=$1 AND (status IN ('SUBMITTED','CONFIRMING') OR (status='RECONCILING' AND reconciliation_claimed_at < $2)) RETURNING *`,[id,staleBefore]);
  return rows[0] as Record<string,any>|undefined;
}

async function releaseAsReview(kind:IntentKind,id:string,message:string){const table=TABLES[kind];await db().unsafe(`UPDATE ${table} SET status='REQUIRES_REVIEW',updated_at=now() WHERE id=$1 AND status='RECONCILING'`,[id]);await exception(kind==='staking'?'STAKING_INTENT':kind==='governance'?'GOVERNANCE_INTENT':kind==='bond'?'BOND_INTENT':'WALLET_TRANSFER_INTENT',id,'RECONCILIATION_EXCEPTION',message);}

async function processClaimed(kind:IntentKind,id:string){
  const intent=await claimIntent(kind,id);if(!intent)return{processed:0,exception:0};
  try{return kind==='staking'?await reconcileStakingIntent(intent):kind==='governance'?await reconcileGovernanceIntent(intent):kind==='bond'?await reconcileBondIntent(intent):await reconcileWalletTransferIntent(intent);}
  catch(e){await releaseAsReview(kind,id,e instanceof Error?e.message:'Unknown reconciliation error');return{processed:0,exception:1};}
}

async function processWebhookHints(limit:number){
  const events=await pendingWebhookSignatures(limit);let processedEvents=0;let reconciled=0;let exceptions=0;
  for(const event of events as Array<Record<string,any>>){
    try{
      const signature=String(event.signature);
      const [staking,governance,bond,transfer]=await Promise.all([
        db()`SELECT id FROM staking_intents WHERE submitted_signature=${signature} LIMIT 1`,
        db()`SELECT id FROM governance_intents WHERE submitted_signature=${signature} LIMIT 1`,
        db()`SELECT id FROM service_bond_intents WHERE submitted_signature=${signature} LIMIT 1`,
        db()`SELECT id FROM wallet_transfer_intents WHERE submitted_signature=${signature} LIMIT 1`,
      ]);
      const result=staking[0]?await processClaimed('staking',String(staking[0].id))
        :governance[0]?await processClaimed('governance',String(governance[0].id))
        :bond[0]?await processClaimed('bond',String(bond[0].id))
        :transfer[0]?await processClaimed('transfer',String(transfer[0].id))
        :{processed:0,exception:0};
      reconciled+=result.processed;exceptions+=result.exception;
      await markWebhookProcessed(String(event.id));processedEvents++;
    }catch(e){exceptions++;await markWebhookFailed(String(event.id),e instanceof Error?e.message:String(e));}
  }
  return {processedEvents,reconciled,exceptions};
}

export async function runReconciliation(){
  const ownerId=`worker:${process.pid}:${crypto.randomUUID()}`;
  const lease=await acquireLease('FULL_RECONCILIATION',ownerId,env.reconciliationLeaseSeconds);
  if(!lease)return{skipped:true,reason:'LEASE_HELD'};
  const[run]=await db()`INSERT INTO reconciliation_runs(run_type,status,details) VALUES('FULL','RUNNING',${db().json({ownerId})}) RETURNING id`;
  let processed=0;let exceptions=0;
  try{
    await indexRewardEpochs(new Date());
    const webhookResult=await processWebhookHints(env.reconciliationBatchSize);
    processed+=webhookResult.reconciled;exceptions+=webhookResult.exceptions;
    const staleBefore=new Date(Date.now()-env.reconciliationLeaseSeconds*1000);
    for(const [kind,table] of Object.entries(TABLES) as Array<[IntentKind,string]>){
      const rows=await db().unsafe(`SELECT id FROM ${table} WHERE status IN ('SUBMITTED','CONFIRMING') OR (status='RECONCILING' AND reconciliation_claimed_at < $2) ORDER BY created_at ASC LIMIT $1`,[env.reconciliationBatchSize,staleBefore]);
      for(const row of rows){const r=await processClaimed(kind,String(row.id));processed+=r.processed;exceptions+=r.exception;}
    }
    try{if(env.rewardVaultRequiredForExecution)await rewardVaultCoverage();}catch(e){exceptions++;await exception('REWARD_VAULT','PWRC_REWARDS','REWARD_VAULT_CHECK_FAILED',e instanceof Error?e.message:'Reward-vault verification failed');}
    try{if(env.bridgeRequiredForExecution)await verifyBridgeReserves();}catch(e){exceptions++;await exception('BRIDGE_RESERVE','PWRC_WPWRC','BRIDGE_RESERVE_CHECK_FAILED',e instanceof Error?e.message:'Bridge reserve verification failed');}
    await db()`UPDATE reconciliation_runs SET status='COMPLETED',processed_count=${processed},exception_count=${exceptions},finished_at=now() WHERE id=${run.id}`;
    const [{open_count}]=await db()`SELECT COUNT(*)::int AS open_count FROM reconciliation_exceptions WHERE resolved_at IS NULL`;
    const openExceptions=Number(open_count);
    if(env.autoPauseOnReconciliationExceptions && openExceptions > env.maxOpenReconciliationExceptions){await tripGlobalCircuit(`Open reconciliation exceptions ${openExceptions} exceed policy ${env.maxOpenReconciliationExceptions} after run ${run.id}`);}
    return{runId:run.id,processed,exceptions,openExceptions};
  }catch(e){await db()`UPDATE reconciliation_runs SET status='FAILED',processed_count=${processed},exception_count=${exceptions+1},finished_at=now(),details=${db().json({ownerId,error:e instanceof Error?e.message:String(e)})} WHERE id=${run.id}`;throw e;}
  finally{await releaseLease(lease.leaseName,lease.token);}
}

export async function reconcileStakingIntentById(id:string){await indexRewardEpochs(new Date());return processClaimed('staking',id);}
export async function reconcileGovernanceIntentById(id:string){return processClaimed('governance',id);}
export async function reconcileBondIntentById(id:string){return processClaimed('bond',id);}
export async function reconcileWalletTransferIntentById(id:string){return processClaimed('transfer',id);}
