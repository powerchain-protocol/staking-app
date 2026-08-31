import 'server-only';
import type { HistoryItem } from '@powerchain/core';
import { db } from '@/lib/server/db';

export async function accountHistory(subjectId:string,limit=50):Promise<HistoryItem[]>{
  const safe=Math.min(200,Math.max(1,Math.floor(limit)));
  const rows=await db()<{
    id:string;category:HistoryItem['category'];action:string;status:string;chain:'SOLANA'|'SUI'|null;amount_atomic:string|null;asset:string|null;tx_id:string|null;occurred_at:string;metadata:unknown;
  }[]>`
    SELECT * FROM (
      SELECT id::text,'STAKING'::text category,action,status,'SOLANA'::text chain,amount_atomic::text,'PWRC'::text asset,submitted_signature tx_id,created_at occurred_at,jsonb_build_object('poolId',pool_id,'positionId',position_id) metadata FROM staking_intents WHERE subject_id=${subjectId}
      UNION ALL
      SELECT id::text,'TRANSFER', 'SEND',status,'SOLANA',amount_atomic::text,'PWRC',submitted_signature,created_at,jsonb_build_object('destination',destination_owner) FROM wallet_transfer_intents WHERE subject_id=${subjectId}
      UNION ALL
      SELECT id::text,'GOVERNANCE',action,status,'SOLANA',voting_weight_atomic::text,'PWRC',submitted_signature,created_at,jsonb_build_object('proposalId',proposal_id,'choice',choice) FROM governance_intents WHERE subject_id=${subjectId}
      UNION ALL
      SELECT id::text,'BOND',action,status,'SOLANA',amount_atomic::text,'PWRC',submitted_signature,created_at,jsonb_build_object('role',role,'serviceType',service_type) FROM service_bond_intents WHERE subject_id=${subjectId}
      UNION ALL
      SELECT id::text,'REWARD','CLAIM',status,'SOLANA',amount_atomic::text,'PWRC',signature,created_at,jsonb_build_object('positionId',position_id) FROM reward_claims WHERE position_id IN (SELECT id FROM staking_positions WHERE subject_id=${subjectId})
      UNION ALL
      SELECT id::text,'SWAP','SWAP',status,chain,input_atomic::text,input_asset,transaction_id,created_at,jsonb_build_object('provider',provider,'outputAsset',output_asset,'expectedOutputAtomic',expected_output_atomic) FROM swap_intents WHERE subject_id=${subjectId}
      UNION ALL
      SELECT id::text,'BRIDGE','CCTP',status,'SOLANA',amount_atomic::text,'USDC',COALESCE(destination_tx,source_tx),created_at,jsonb_build_object('sourceDomain',source_domain,'destinationDomain',destination_domain) FROM cctp_intents WHERE subject_id=${subjectId}
    ) h
    ORDER BY occurred_at DESC
    LIMIT ${safe}
  `;
  return rows.map(r=>({id:r.id,category:r.category,action:r.action,status:r.status,chain:r.chain??undefined,amountAtomic:r.amount_atomic??undefined,asset:r.asset??undefined,txId:r.tx_id??undefined,occurredAt:new Date(r.occurred_at).toISOString(),metadata:(r.metadata??{}) as Record<string,unknown>}));
}
