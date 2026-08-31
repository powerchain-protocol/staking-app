import 'server-only';
import { indexRewardEpochs,rewardsOverview,rewardVaultCoverage } from '@/lib/server/rewards';
export const rewardsService={
  async overview(session:Parameters<typeof rewardsOverview>[0]){await indexRewardEpochs(new Date());return rewardsOverview(session);},
  coverage:rewardVaultCoverage,
  index:()=>indexRewardEpochs(new Date()),
};
