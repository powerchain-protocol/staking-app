// Realtime events are invalidation/status signals only. Financial/accounting state
// must always be refreshed from the authenticated HTTP API after an event.
export const REALTIME_PROTOCOL = 'powerchain.realtime.v1' as const;

export const REALTIME_TOPICS = [
  'system.readiness',
  'activity.event',
  'portfolio.updated',
  'staking.intent',
  'staking.position',
  'rewards.claim',
  'rewards.epoch',
  'rewards.coverage',
  'governance.intent',
  'governance.proposal',
  'bonds.intent',
  'bonds.position',
  'wallet.transfer',
  'wallet.balance',
  'swap.intent',
  'bridge.cctp',
  'bridge.reserve',
] as const;

export type RealtimeTopic = typeof REALTIME_TOPICS[number];
export type RealtimeConnectionState = 'idle'|'connecting'|'open'|'reconnecting'|'closed'|'error';

export interface RealtimeEventEnvelope<T = Record<string, unknown>> {
  eventId: string;
  topic: RealtimeTopic;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  subjectScoped: boolean;
  payload: T;
  createdAt: string;
}

export type RealtimeClientMessage =
  | { type: 'subscribe'; topics: RealtimeTopic[]; afterEventId?: string | null }
  | { type: 'unsubscribe'; topics: RealtimeTopic[] }
  | { type: 'ping'; nonce?: string };

export type RealtimeServerMessage =
  | { type: 'ready'; connectionId: string; protocol: typeof REALTIME_PROTOCOL; heartbeatSeconds: number; maxSubscriptions: number }
  | { type: 'subscribed'; topics: RealtimeTopic[] }
  | { type: 'unsubscribed'; topics: RealtimeTopic[] }
  | { type: 'event'; event: RealtimeEventEnvelope }
  | { type: 'pong'; nonce?: string; at: string }
  | { type: 'heartbeat'; at: string }
  | { type: 'error'; code: string; message: string; retryable: boolean };

export interface RealtimeTokenResponse {
  token: string;
  protocol: typeof REALTIME_PROTOCOL;
  websocketUrl: string;
  expiresAt: string;
  heartbeatSeconds: number;
  maxSubscriptions: number;
}

export interface RealtimeEventsResponse {
  events: RealtimeEventEnvelope[];
  cursor: string | null;
}

export interface RealtimeStatusResponse {
  enabled: boolean;
  protocol: typeof REALTIME_PROTOCOL;
  transport: 'websocket';
  authoritativeState: false;
  publicUrl: string;
  topics: readonly RealtimeTopic[];
  heartbeatSeconds: number;
  maxSubscriptions: number;
  eventRetentionHours: number;
  runtime: null | {
    instanceId: string;
    ageSeconds: number;
    connections: number;
    eventCursor: string;
    healthy: boolean;
  };
}
