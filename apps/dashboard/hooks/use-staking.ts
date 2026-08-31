'use client';import { endpoints } from '@powerchain/contracts';import { useLiveQuery } from './use-live-query';
export function useStakingPositions(enabled=true){return useLiveQuery<{positions:any[]}>(endpoints.staking.positions,['staking.intent','staking.position','rewards.claim'],{enabled,pollFallbackMs:30_000});}
