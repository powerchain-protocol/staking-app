'use client';
import { useEffect,useSyncExternalStore } from 'react';import type { RealtimeEventEnvelope,RealtimeTopic } from '@powerchain/contracts';import { realtime } from '@/lib/realtime';
export function useRealtimeState(){return useSyncExternalStore((fn)=>realtime.subscribeState(fn),realtime.getState,realtime.getServerState)}
export function useRealtime(topics:RealtimeTopic[],handler:(event:RealtimeEventEnvelope)=>void,enabled=true){const key=topics.join('|');useEffect(()=>{if(!enabled||!topics.length)return;return realtime.subscribe(topics,handler)},[enabled,key,handler]);return useRealtimeState();}
