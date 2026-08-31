'use client';import { endpoints,type SystemHealthResponse } from '@powerchain/contracts';import { useLiveQuery } from './use-live-query';
export function useSystemStatus(){return useLiveQuery<SystemHealthResponse>(endpoints.system.health,['system.readiness'],{pollFallbackMs:30_000});}
