'use client';import { endpoints } from '@powerchain/contracts';import { useLiveQuery } from './use-live-query';
export function useRewards(enabled=true){return useLiveQuery<any>(endpoints.rewards.overview,['rewards.claim','rewards.epoch','rewards.coverage','staking.position'],{enabled,pollFallbackMs:30_000});}
