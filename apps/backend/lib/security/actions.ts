import 'server-only';
import { ApiError } from '@/lib/server/http';
import { assertStateChangeSafety } from '@/lib/server/safety-gate';

const actionScope: Record<string, 'STAKING'|'GOVERNANCE'|'BONDS'|'TRANSFERS'|'REWARDS'|'BRIDGE'> = {
  'stake.create':'STAKING',
  'stake.increase':'STAKING',
  'stake.unstake':'STAKING',
  'stake.withdraw':'STAKING',
  'reward.claim':'REWARDS',
  'reward.compound':'REWARDS',
  'governance.vote':'GOVERNANCE',
  'governance.execute':'GOVERNANCE',
  'bond.create':'BONDS',
  'bond.withdraw':'BONDS',
  'transfer.send':'TRANSFERS',
  'bridge.cctp':'BRIDGE',
  'bridge.wpwrc':'BRIDGE',
  'swap.prepare':'TRANSFERS',
  'solana.pay':'TRANSFERS',
};

export async function enforceRuntimeAction(action: string) {
  const scope = actionScope[action];
  if (!scope) throw new ApiError(400, 'UNKNOWN_ACTION', `Unknown action ${action}`);
  await assertStateChangeSafety(scope);
}
