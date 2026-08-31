'use client';import { executionIntentPath, type ExecutionKind, type RealtimeTopic } from '@powerchain/contracts';import { useLiveQuery } from './use-live-query';
const topic:Record<ExecutionKind,RealtimeTopic>={staking:'staking.intent',governance:'governance.intent',bond:'bonds.intent',transfer:'wallet.transfer',swap:'swap.intent',cctp:'bridge.cctp'};
export function useIntent(kind:ExecutionKind,id:string|null){return useLiveQuery<any>(id?executionIntentPath(kind,id):'/api/v1/system/health',[topic[kind]],{enabled:Boolean(id),pollFallbackMs:5_000,debounceMs:50});}
