import 'server-only';
import { createStakingIntent,getStakingIntent,listPositions,prepareStakingIntent,submitStakingIntent,type StakingAction } from '@/lib/server/staking';
export type { StakingAction } from '@/lib/server/staking';
export const stakingService={createIntent:createStakingIntent,getIntent:getStakingIntent,listPositions,prepareIntent:prepareStakingIntent,submitIntent:submitStakingIntent};
