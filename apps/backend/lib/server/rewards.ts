import 'server-only';
import { pools } from '@/lib/data';
import { getAccount, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { db, type Sql } from './db';
import { env, ConfigurationError } from './config';
import { solanaConnection } from './solana';
import { pwrcMint } from './anchor';
import { postJournal } from './ledger';
import { ApiError } from './http';
import { assertStateChangeSafety } from './safety-gate';

const SCALE = 1_000_000_000_000_000_000n;
type Session = { sub: string; wallet: string };
function bigint(value: unknown) { return BigInt(String(value ?? '0')); }

export async function initializePositionRewardCursors(positionId: string, poolId: string, tx?: Sql) {
  const sql = tx ?? db();
  const epochs = await sql`SELECT id,cumulative_index FROM reward_epochs WHERE pool_id=${poolId} AND status IN ('ACTIVE','FINALIZING')`;
  for (const epoch of epochs) {
    await sql`INSERT INTO position_reward_cursors(position_id,epoch_id,index_entry) VALUES(${positionId},${epoch.id},${epoch.cumulative_index}) ON CONFLICT(position_id,epoch_id) DO NOTHING`;
  }
}

export async function resumePositionRewardCursors(positionId: string, poolId: string, tx?: Sql) {
  const sql = tx ?? db();
  const epochs = await sql`SELECT id,cumulative_index FROM reward_epochs WHERE pool_id=${poolId} AND status IN ('ACTIVE','FINALIZING')`;
  for (const epoch of epochs) {
    await sql`
      INSERT INTO position_reward_cursors(position_id,epoch_id,index_entry)
      VALUES(${positionId},${epoch.id},${epoch.cumulative_index})
      ON CONFLICT(position_id,epoch_id) DO UPDATE
      SET index_entry=EXCLUDED.index_entry,updated_at=now()
    `;
  }
}

export async function indexRewardEpochs(now = new Date()) {
  const sql = db();
  const candidates = await sql`SELECT id FROM reward_epochs WHERE status IN ('SCHEDULED','ACTIVE','FINALIZING') AND starts_at <= ${now} ORDER BY starts_at ASC`;
  let processed = 0;
  for (const candidate of candidates) {
    await sql.begin(async (tx) => {
      const [epoch] = await tx`SELECT * FROM reward_epochs WHERE id=${candidate.id} FOR UPDATE`;
      if (!epoch || !['SCHEDULED','ACTIVE','FINALIZING'].includes(String(epoch.status))) return;
      const start = new Date(epoch.starts_at);
      const end = new Date(epoch.ends_at);
      const lastIndexed = epoch.last_indexed_at ? new Date(epoch.last_indexed_at) : start;
      const current = now < end ? now : end;
      if (current <= lastIndexed) {
        if (now >= end && epoch.status !== 'FINALIZED') await tx`UPDATE reward_epochs SET status='FINALIZED',updated_at=now() WHERE id=${epoch.id}`;
        return;
      }

      const durationMs = BigInt(end.getTime() - start.getTime());
      const elapsedMs = BigInt(current.getTime() - start.getTime());
      const budget = bigint(epoch.budget_atomic);
      const targetEmitted = budget * elapsedMs / durationMs;
      const emitted = bigint(epoch.emitted_atomic);
      if (targetEmitted <= emitted) return;
      const delta = targetEmitted - emitted;

      const [{ weight }] = await tx`SELECT COALESCE(SUM(effective_weight_atomic),0)::text AS weight FROM staking_positions WHERE pool_id=${epoch.pool_id} AND status IN ('ACTIVE','LOCKED')`;
      const totalWeight = bigint(weight);
      const finalStatus = now >= end ? 'FINALIZED' : 'ACTIVE';

      if (totalWeight === 0n) {
        await tx`
          UPDATE reward_epochs SET status=${finalStatus},emitted_atomic=${targetEmitted.toString()},
            skipped_atomic=(skipped_atomic::numeric + ${delta.toString()}::numeric),last_indexed_at=${current},updated_at=now()
          WHERE id=${epoch.id}
        `;
        processed += 1;
        return;
      }

      const scale = bigint(epoch.index_scale ?? SCALE);
      const indexDelta = delta * scale / totalWeight;
      const nextIndex = bigint(epoch.cumulative_index) + indexDelta;
      await tx`
        UPDATE reward_epochs SET status=${finalStatus},emitted_atomic=${targetEmitted.toString()},cumulative_index=${nextIndex.toString()},last_indexed_at=${current},updated_at=now()
        WHERE id=${epoch.id}
      `;
      await tx`
        INSERT INTO position_reward_cursors(position_id,epoch_id,index_entry)
        SELECT p.id,${epoch.id},CASE WHEN p.lock_started_at > ${start} THEN ${nextIndex.toString()}::numeric ELSE 0 END
        FROM staking_positions p WHERE p.pool_id=${epoch.pool_id} AND p.status IN ('ACTIVE','LOCKED')
        ON CONFLICT(position_id,epoch_id) DO NOTHING
      `;
      await postJournal({ sourceType: 'REWARD_EPOCH_EMISSION', sourceId: `${String(epoch.id)}:${targetEmitted.toString()}`, lines: [
        { accountCode: 'STAKING_REWARD_EXPENSE', amountAtomic: delta },
        { accountCode: 'STAKING_REWARD_LIABILITY', amountAtomic: -delta },
      ] }, tx as Sql);
      processed += 1;
    });
  }
  return { processed };
}

export async function claimableForPosition(positionId: string) {
  const sql = db();
  const [position] = await sql`SELECT * FROM staking_positions WHERE id=${positionId} LIMIT 1`;
  if (!position) throw new ApiError(404, 'POSITION_NOT_FOUND', 'Position not found');
  const cursors = await sql`
    SELECT c.*,e.cumulative_index,e.index_scale,e.status AS epoch_status,e.id AS epoch_id
    FROM position_reward_cursors c JOIN reward_epochs e ON e.id=c.epoch_id WHERE c.position_id=${positionId}
  `;
  const weight = bigint(position.effective_weight_atomic);
  let total = 0n;
  const byEpoch: Array<{ epochId: string; claimableAtomic: string }> = [];
  for (const row of cursors as Array<Record<string, any>>) {
    const deltaIndex = bigint(row.cumulative_index) - bigint(row.index_entry);
    const gross = bigint(row.accrued_atomic) + (deltaIndex > 0n ? weight * deltaIndex / bigint(row.index_scale ?? SCALE) : 0n);
    const claimable = gross > bigint(row.claimed_atomic) ? gross - bigint(row.claimed_atomic) : 0n;
    total += claimable;
    byEpoch.push({ epochId: String(row.epoch_id), claimableAtomic: claimable.toString() });
  }
  return { positionId, claimableAtomic: total.toString(), byEpoch };
}

export async function rewardsOverview(session: Session) {
  await indexRewardEpochs(new Date());
  const positions = await db()`SELECT id,pool_id,principal_atomic,effective_weight_atomic FROM staking_positions WHERE subject_id=${session.sub} AND status IN ('ACTIVE','LOCKED')`;
  let claimable = 0n;
  const details = [];
  for (const position of positions as Array<Record<string, any>>) {
    const result = await claimableForPosition(String(position.id));
    claimable += BigInt(result.claimableAtomic);
    details.push(result);
  }
  return { claimableAtomic: claimable.toString(), positions: details };
}

async function rewardCommitments(vaultAddress: string, tx?: Sql) {
  const sql = tx ?? db();
  const [row] = await sql`
    SELECT
      COALESCE(SUM(GREATEST((emitted_atomic-skipped_atomic)::numeric,0)),0)::text AS emitted_liability,
      COALESCE(SUM(GREATEST((budget_atomic-emitted_atomic)::numeric,0)),0)::text AS unemitted
    FROM reward_epochs WHERE reward_vault=${vaultAddress} AND status IN ('SCHEDULED','ACTIVE','FINALIZING','FINALIZED')
  `;
  const [{ claimed }] = await sql`SELECT COALESCE(SUM(a.amount_atomic),0)::text AS claimed FROM reward_claim_allocations a JOIN reward_epochs e ON e.id=a.epoch_id JOIN reward_claims c ON c.id=a.claim_id WHERE c.status='SETTLED' AND e.reward_vault=${vaultAddress}`;
  const [{ unallocated }] = await sql`SELECT COALESCE(SUM(c.amount_atomic),0)::text AS unallocated FROM reward_claims c WHERE c.status='SETTLED' AND NOT EXISTS(SELECT 1 FROM reward_claim_allocations a WHERE a.claim_id=c.id)`;
  const accruedLiability=bigint(row.emitted_liability)-bigint(claimed);
  return{accruedLiability:accruedLiability>0n?accruedLiability:0n,committedUnemitted:bigint(row.unemitted),unallocatedClaims:bigint(unallocated)};
}

export async function rewardVaultCoverage() {
  if (!env.rewardVaultTokenAccount) throw new ConfigurationError('PWRC_REWARD_VAULT_TOKEN_ACCOUNT is required for coverage verification');
  const connection = solanaConnection();
  const vault = await getAccount(connection,new PublicKey(env.rewardVaultTokenAccount),env.solanaCommitment,TOKEN_2022_PROGRAM_ID);
  if (!vault.mint.equals(pwrcMint())) throw new ConfigurationError('Configured reward vault does not hold PWRC');
  const [{ slot }, commitments] = await Promise.all([
    connection.getSlot(env.solanaCommitment).then((slot)=>({slot})),
    rewardCommitments(env.rewardVaultTokenAccount),
  ]);
  const totalCommitted=commitments.accruedLiability+commitments.committedUnemitted;
  const availableAfterCommitments=vault.amount-totalCommitted;
  const covered=availableAfterCommitments>=0n&&commitments.unallocatedClaims===0n;
  const [snapshot] = await db()`
    INSERT INTO reward_vault_snapshots(network,vault_address,balance_atomic,accrued_liability_atomic,committed_unemitted_atomic,available_after_commitments_atomic,covered,slot)
    VALUES('SOLANA',${env.rewardVaultTokenAccount},${vault.amount.toString()},${commitments.accruedLiability.toString()},${commitments.committedUnemitted.toString()},${availableAfterCommitments.toString()},${covered},${slot}) RETURNING id
  `;
  return {
    vault: env.rewardVaultTokenAccount,
    balanceAtomic: vault.amount.toString(),
    accruedLiabilityAtomic: commitments.accruedLiability.toString(),
    committedUnemittedAtomic: commitments.committedUnemitted.toString(),
    unallocatedSettledClaimsAtomic:commitments.unallocatedClaims.toString(),
    availableAfterCommitmentsAtomic: availableAfterCommitments.toString(),
    covered,
    coverageBps: totalCommitted === 0n ? null : Number(vault.amount * 10_000n / totalCommitted),
    snapshotId: snapshot.id,
  };
}

export async function createRewardEpoch(session: Session,input: { poolId: string; startsAt: Date; endsAt: Date; budgetAtomic: bigint; rewardVault: string; policyVersion: string }) {
  await assertStateChangeSafety('STAKING');
  if (!env.stakingAdminWallets.includes(session.wallet)) throw new ApiError(403,'ADMIN_REQUIRED','Wallet is not authorized to create reward epochs');
  if (!pools.some((pool)=>pool.id===input.poolId)) throw new ApiError(400,'POOL_NOT_FOUND','Unknown staking pool for reward epoch');
  if (input.endsAt <= input.startsAt) throw new ApiError(400,'INVALID_ARGUMENT','Reward epoch end must be after start');
  const [overlap]=await db()`SELECT id,starts_at,ends_at FROM reward_epochs WHERE pool_id=${input.poolId} AND status IN ('SCHEDULED','ACTIVE','FINALIZING') AND tstzrange(starts_at,ends_at,'[)') && tstzrange(${input.startsAt},${input.endsAt},'[)') LIMIT 1`;
  if(overlap)throw new ApiError(409,'REWARD_EPOCH_OVERLAP','Reward epochs for the same staking pool may not overlap',{existingEpochId:overlap.id,startsAt:overlap.starts_at,endsAt:overlap.ends_at});
  const connection = solanaConnection();
  const vaultKey = new PublicKey(input.rewardVault);
  const vault = await getAccount(connection,vaultKey,env.solanaCommitment,TOKEN_2022_PROGRAM_ID);
  if (!vault.mint.equals(pwrcMint())) throw new ApiError(400,'INVALID_REWARD_VAULT','Reward vault must hold PWRC');

  let created: Record<string, any> | null = null;
  await db().begin(async (tx) => {
    await tx`INSERT INTO reward_vault_controls(network,vault_address) VALUES('SOLANA',${input.rewardVault}) ON CONFLICT DO NOTHING`;
    await tx`SELECT vault_address FROM reward_vault_controls WHERE network='SOLANA' AND vault_address=${input.rewardVault} FOR UPDATE`;
    const commitments = await rewardCommitments(input.rewardVault, tx as Sql);
    if(commitments.unallocatedClaims>0n)throw new ApiError(409,'REWARD_ACCOUNTING_REVIEW_REQUIRED','Settled legacy reward claims lack epoch attribution; new epoch creation is blocked until they are reconciled',{unallocatedSettledClaimsAtomic:commitments.unallocatedClaims.toString()});
    const required=commitments.accruedLiability+commitments.committedUnemitted+input.budgetAtomic;
    if (vault.amount < required) throw new ApiError(409,'REWARD_VAULT_OVERCOMMITTED','Reward vault cannot cover existing liabilities, committed epochs, and the requested new epoch',{ balanceAtomic:vault.amount.toString(), requiredAtomic:required.toString(), existingAccruedLiabilityAtomic:commitments.accruedLiability.toString(), existingCommittedUnemittedAtomic:commitments.committedUnemitted.toString(), requestedBudgetAtomic:input.budgetAtomic.toString() });
    [created] = await tx`
      INSERT INTO reward_epochs(network,pool_id,starts_at,ends_at,budget_atomic,reward_vault,policy_version,status)
      VALUES('SOLANA',${input.poolId},${input.startsAt},${input.endsAt},${input.budgetAtomic.toString()},${input.rewardVault},${input.policyVersion},${input.startsAt <= new Date() ? 'ACTIVE' : 'SCHEDULED'}) RETURNING *
    `;
  });
  return created!;
}

export async function crystallizePositionRewards(positionId: string, tx?: Sql) {
  const sql = tx ?? db();
  const [position] = await sql`SELECT effective_weight_atomic FROM staking_positions WHERE id=${positionId} LIMIT 1`;
  if (!position) throw new ApiError(404,'POSITION_NOT_FOUND','Position not found');
  const weight = bigint(position.effective_weight_atomic);
  const rows = await sql`SELECT c.position_id,c.epoch_id,c.index_entry,c.accrued_atomic,e.cumulative_index,e.index_scale FROM position_reward_cursors c JOIN reward_epochs e ON e.id=c.epoch_id WHERE c.position_id=${positionId}`;
  for (const row of rows as Array<Record<string, any>>) {
    const deltaIndex = bigint(row.cumulative_index)-bigint(row.index_entry);
    if (deltaIndex <= 0n) continue;
    const newlyAccrued = weight*deltaIndex/bigint(row.index_scale??SCALE);
    await sql`UPDATE position_reward_cursors SET accrued_atomic=(accrued_atomic::numeric+${newlyAccrued.toString()}::numeric),index_entry=${row.cumulative_index},updated_at=now() WHERE position_id=${positionId} AND epoch_id=${row.epoch_id}`;
  }
}