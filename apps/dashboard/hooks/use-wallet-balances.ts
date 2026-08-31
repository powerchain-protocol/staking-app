'use client';import { endpoints } from '@powerchain/contracts';import { useLiveQuery } from './use-live-query';
export function useWalletBalances(enabled=true){return useLiveQuery<any>(endpoints.wallets.balances,['wallet.transfer','wallet.balance','staking.position','bonds.position','swap.intent','bridge.cctp'],{enabled,pollFallbackMs:20_000});}
