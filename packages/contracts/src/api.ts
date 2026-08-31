import type { RealtimeEventsResponse, RealtimeStatusResponse, RealtimeTokenResponse } from './realtime';
import type { ExecutionKind, SystemHealthResponse } from './domain';

export const API_V1 = '/api/v1' as const;


export type HttpMethod = 'GET'|'POST'|'PUT'|'PATCH'|'DELETE';
export interface EndpointDescriptor { method: HttpMethod; path: string; description: string; version: 'v1'; }
export interface EndpointRegistryResponse { version: '1.0.0'; basePath: typeof API_V1; endpoints: EndpointDescriptor[]; }

export const endpoints = {
  system: {
    health: `${API_V1}/system/health`,
    readiness: `${API_V1}/system/readiness`,
    capabilities: `${API_V1}/system/capabilities`,
  },
  realtime: {
    status: `${API_V1}/realtime/status`,
    token: `${API_V1}/realtime/token`,
    events: `${API_V1}/realtime/events`,
  },
  portfolio: `${API_V1}/portfolio`,
  staking: {
    positions: `${API_V1}/staking/positions`,
    intents: `${API_V1}/staking/intents`,
  },
  rewards: {
    overview: `${API_V1}/rewards/overview`,
    coverage: `${API_V1}/rewards/coverage`,
    epochs: `${API_V1}/rewards/epochs`,
  },
  governance: {
    overview: `${API_V1}/governance/overview`,
    proposals: `${API_V1}/governance/proposals`,
    intents: `${API_V1}/governance/intents`,
  },
  bonds: {
    list: `${API_V1}/bonds`,
    intents: `${API_V1}/bonds/intents`,
  },
  wallets: {
    list: `${API_V1}/wallets`,
    balances: `${API_V1}/wallets/balances`,
    transfers: `${API_V1}/wallets/transfers`,
  },
  bridge: { reserves: `${API_V1}/bridge/reserves` },
  swaps: { intents: `${API_V1}/swaps/intents` },
  cctp: { intents: `${API_V1}/cctp/intents` },
  ledger: `${API_V1}/ledger`,
  histories: `${API_V1}/histories`,
  actions: `${API_V1}/actions`,
  endpointRegistry: `${API_V1}/endpoints`,
} as const;


export function executionIntentCollection(kind: ExecutionKind) {
  if (kind === 'staking') return endpoints.staking.intents;
  if (kind === 'governance') return endpoints.governance.intents;
  if (kind === 'bond') return endpoints.bonds.intents;
  if (kind === 'transfer') return endpoints.wallets.transfers;
  if (kind === 'swap') return endpoints.swaps.intents;
  return endpoints.cctp.intents;
}

export function executionIntentPath(kind: ExecutionKind, intentId: string) {
  return `${executionIntentCollection(kind)}/${encodeURIComponent(intentId)}`;
}

export function executionPreparePath(kind: ExecutionKind, intentId: string) {
  return `${executionIntentPath(kind, intentId)}/prepare`;
}

export function executionSubmitPath(kind: ExecutionKind, intentId: string) {
  return `${executionIntentPath(kind, intentId)}/submit`;
}

export interface EndpointResponseMap {
  [endpoints.system.health]: SystemHealthResponse;
  [endpoints.system.readiness]: SystemHealthResponse;
  [endpoints.realtime.status]: RealtimeStatusResponse;
  [endpoints.realtime.token]: RealtimeTokenResponse;
  [endpoints.realtime.events]: RealtimeEventsResponse;
}
