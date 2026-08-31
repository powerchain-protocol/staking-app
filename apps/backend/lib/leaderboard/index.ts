import 'server-only';
import type { LeaderboardEntry } from '@powerchain/core';
import { db } from '@/lib/server/db';

export async function refreshLeaderboard(){
  await db()`
    WITH subjects AS (
      SELECT subject_id FROM staking_positions
      UNION SELECT subject_id FROM governance_votes
      UNION SELECT subject_id FROM service_bonds
    ),
    stake AS (
      SELECT subject_id,COALESCE(SUM(principal_atomic),0)::numeric amount FROM staking_positions WHERE status IN ('ACTIVE','LOCKED','UNBONDING','WITHDRAWABLE') GROUP BY subject_id
    ),
    gov AS (
      SELECT subject_id,COUNT(*)::numeric votes,COALESCE(SUM(weight_atomic),0)::numeric weight FROM governance_votes GROUP BY subject_id
    ),
    bonds AS (
      SELECT subject_id,COALESCE(SUM(amount_atomic),0)::numeric amount FROM service_bonds WHERE status IN ('ACTIVE','UNBONDING','WITHDRAWABLE') GROUP BY subject_id
    )
    INSERT INTO leaderboard_scores(subject_id,staking_score,governance_score,network_score,community_score,policy_version,calculated_at)
    SELECT s.subject_id,
      sqrt(COALESCE(stake.amount,0)/1000000000.0),
      COALESCE(gov.votes,0)*10 + sqrt(COALESCE(gov.weight,0)/1000000000.0),
      sqrt(COALESCE(bonds.amount,0)/1000000000.0)*1.5,
      0,
      'verified-participation-v1',
      now()
    FROM subjects s LEFT JOIN stake USING(subject_id) LEFT JOIN gov USING(subject_id) LEFT JOIN bonds USING(subject_id)
    ON CONFLICT(subject_id) DO UPDATE SET
      staking_score=EXCLUDED.staking_score,governance_score=EXCLUDED.governance_score,network_score=EXCLUDED.network_score,
      community_score=EXCLUDED.community_score,policy_version=EXCLUDED.policy_version,calculated_at=EXCLUDED.calculated_at
  `;
}

export async function leaderboard(limit=100):Promise<LeaderboardEntry[]>{
  const rows=await db()<{
    subject_id:string;display_name:string|null;wallet:string|null;staking_score:string;governance_score:string;network_score:string;total_score:string;
  }[]>`
    SELECT l.subject_id,p.display_name,w.wallet_address wallet,l.staking_score::text,l.governance_score::text,l.network_score::text,l.total_score::text
    FROM leaderboard_scores l
    LEFT JOIN user_profiles p ON p.subject_id=l.subject_id
    LEFT JOIN LATERAL (SELECT wallet_address FROM wallet_links WHERE subject_id=l.subject_id AND is_primary=true LIMIT 1) w ON true
    ORDER BY l.total_score DESC,l.subject_id ASC
    LIMIT ${Math.min(200,Math.max(1,limit))}
  `;
  return rows.map((r,i)=>({rank:i+1,subjectId:r.subject_id,displayName:r.display_name||((r.wallet??'participant').slice(0,4)+'…'+(r.wallet??'').slice(-4)),score:Number(r.total_score),stakingScore:Number(r.staking_score),governanceScore:Number(r.governance_score),networkScore:Number(r.network_score),verified:true}));
}
