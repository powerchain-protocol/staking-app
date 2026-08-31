export type Pool = {
  id: 'flex' | '30' | '90' | '180' | '365';
  name: string;
  short: string;
  lock: string;
  lockDays: number | null;
  cooldownDays: number;
  weight: string;
  weightValue: number;
  rate: string;
  rateValue: number;
  recommended?: boolean;
  accent: string;
};

export const pools: Pool[] = [
  { id: 'flex', name: 'Flexible PWRC', short: 'Flexible', lock: 'No fixed lock', lockDays: null, cooldownDays: 7, weight: '1.00×', weightValue: 1, rate: '4.1%', rateValue: 4.1, accent: 'blue' },
  { id: '30', name: '30-Day PWRC', short: '30 Days', lock: 'Short-term commitment', lockDays: 30, cooldownDays: 0, weight: '1.10×', weightValue: 1.1, rate: '6.2%', rateValue: 6.2, accent: 'teal' },
  { id: '90', name: '90-Day PWRC', short: '90 Days', lock: 'Medium-term commitment', lockDays: 90, cooldownDays: 0, weight: '1.25×', weightValue: 1.25, rate: '8.4%', rateValue: 8.4, recommended: true, accent: 'indigo' },
  { id: '180', name: '180-Day PWRC', short: '180 Days', lock: 'Long-term commitment', lockDays: 180, cooldownDays: 0, weight: '1.50×', weightValue: 1.5, rate: '10.2%', rateValue: 10.2, accent: 'amber' },
  { id: '365', name: '365-Day PWRC', short: '365 Days', lock: 'Maximum commitment', lockDays: 365, cooldownDays: 0, weight: '2.00×', weightValue: 2, rate: '13.8%', rateValue: 13.8, accent: 'green' }
];

export type Position = {
  id: string;
  pool: string;
  poolId: Pool['id'];
  status: 'Active' | 'Locked' | 'Unbonding' | 'Withdrawable' | 'Closed';
  started: string;
  remaining: string;
  staked: number;
  earned: number;
  unlock: string;
  weight: string;
  progress: number;
};

export const positions: Position[] = [
  { id: 'pos_7JqK9pL2', pool: '90-Day PWRC', poolId: '90', status: 'Active', started: '27 Aug 2026', remaining: '53 days left', staked: 2_500_000, earned: 82_450, unlock: '18 Nov 2026', weight: '1.25×', progress: 41 },
  { id: 'pos_30dk4', pool: '30-Day PWRC', poolId: '30', status: 'Active', started: '20 Aug 2026', remaining: '20 days left', staked: 500_000, earned: 9_250, unlock: '19 Sep 2026', weight: '1.10×', progress: 33 },
  { id: 'pos_365x8', pool: '365-Day PWRC', poolId: '365', status: 'Locked', started: '15 Jun 2026', remaining: '289 days left', staked: 1_000_000, earned: 45_120, unlock: '15 Jun 2027', weight: '2.00×', progress: 21 },
  { id: 'pos_flex5', pool: 'Flexible PWRC', poolId: 'flex', status: 'Active', started: '05 Aug 2026', remaining: '7-day cooldown', staked: 200_000, earned: 3_150, unlock: '—', weight: '1.00×', progress: 100 }
];

export const rewards = [
  { name: 'Staking Rewards', amount: 55_200, share: '66.9%', tone: 'green' },
  { name: 'Community Rewards', amount: 12_000, share: '14.6%', tone: 'blue' },
  { name: 'Energy Rewards', amount: 8_250, share: '10.0%', tone: 'violet' },
  { name: 'Governance Rewards', amount: 7_000, share: '8.5%', tone: 'amber' }
];

export const proposals = [
  { id: 'PCP-024', title: 'Increase Community Energy Reward Budget', end: '4d 12h 34m', forPct: 62.4, against: 23.6, abstain: 14.0, status: 'Active' },
  { id: 'PCP-023', title: 'Update Staking Reward Distribution Model', end: '9d 06h 11m', forPct: 71.2, against: 16.8, abstain: 12.0, status: 'Active' },
  { id: 'PCP-022', title: 'Add Support for Sui DePIN Operator Bonds', end: '2d 08h 45m', forPct: 54.7, against: 31.6, abstain: 13.7, status: 'Review' },
  { id: 'PCP-021', title: 'Adjust Protocol Fee Allocation', end: '16d 02h 22m', forPct: 45.3, against: 40.1, abstain: 14.6, status: 'Active' }
];

export type ActivityType = 'Receive' | 'Reward' | 'Send' | 'Stake' | 'Governance' | 'Bond';
export const txs: Array<{ type: ActivityType; amount: string; from: string; tx: string; time: string; status: 'Reconciled' | 'Finalized' | 'Pending' }> = [
  { type: 'Receive', amount: '+20,000 PWRC', from: 'From: 8XhU…7a2P', tx: '5xKj…Vn2', time: 'Today, 09:12', status: 'Reconciled' },
  { type: 'Reward', amount: '+2,450 PWRC', from: 'Staking Rewards', tx: '9aLm…Qd8', time: 'Today, 08:00', status: 'Reconciled' },
  { type: 'Send', amount: '-100,000 PWRC', from: 'To: 3QmN…h9Lp', tx: '7aB7…Mz1', time: 'Yesterday, 22:31', status: 'Finalized' },
  { type: 'Stake', amount: '-500,000 PWRC', from: 'Staking Program', tx: '4tP2…Sd3', time: 'Yesterday, 14:05', status: 'Reconciled' },
  { type: 'Governance', amount: 'Vote cast', from: 'PCP-024', tx: '3fQr…Aa9', time: '28 Aug, 18:22', status: 'Finalized' },
  { type: 'Bond', amount: '+1,000,000 PWRC', from: 'Verifier Bond', tx: '8pLm…Ty4', time: '27 Aug, 11:02', status: 'Reconciled' }
];

export const PWRC_REFERENCE_PRICE_USD = 0.000002;
export const REPRESENTATIVE_DATA_LABEL = 'Representative data';
