'use client';
import type { PortfolioSnapshot } from '@/types/portfolio';import { endpoints } from '@powerchain/contracts';import { useLiveQuery } from './use-live-query';
export function usePortfolio(){const query=useLiveQuery<{portfolio:PortfolioSnapshot}>(endpoints.portfolio,['portfolio.updated','wallet.balance','staking.position','rewards.claim','swap.intent','bridge.cctp'],{transform:(x)=>x,pollFallbackMs:30_000});return{portfolio:query.data?.portfolio??null,...query};}
