import { endpoints, executionIntentPath, executionPreparePath, executionSubmitPath, type ActionRegistryResponse, type EndpointRegistryResponse, type ExecutionKind, type PreparedSolanaIntent } from '@powerchain/contracts';
import { apiJson, apiPost, type ApiRequestOptions } from './http';

export class PowerChainClient {
  get<T>(path: string, options?: ApiRequestOptions) { return apiJson<T>(path, options); }
  post<T>(path: string, body: unknown, prefix = 'action', options?: ApiRequestOptions) { return apiPost<T>(path, body, prefix, options); }

  health() { return this.get(endpoints.system.health); }
  readiness() { return this.get(endpoints.system.readiness); }
  capabilities<T = Record<string, unknown>>() { return this.get<T>(endpoints.system.capabilities); }
  realtimeStatus<T = import('@powerchain/contracts').RealtimeStatusResponse>() { return this.get<T>(endpoints.realtime.status); }
  endpointRegistry<T = EndpointRegistryResponse>() { return this.get<T>(endpoints.endpointRegistry); }
  actions<T = ActionRegistryResponse>() { return this.get<T>(endpoints.actions); }
  portfolio<T = Record<string, unknown>>() { return this.get<T>(endpoints.portfolio); }
  positions<T = { positions: unknown[] }>() { return this.get<T>(endpoints.staking.positions); }
  rewards<T = Record<string, unknown>>() { return this.get<T>(endpoints.rewards.overview); }
  governance<T = Record<string, unknown>>() { return this.get<T>(endpoints.governance.overview); }
  proposals<T = { proposals: unknown[] }>() { return this.get<T>(endpoints.governance.proposals); }
  bonds<T = { bonds: unknown[] }>() { return this.get<T>(endpoints.bonds.list); }
  balances<T = Record<string, unknown>>() { return this.get<T>(endpoints.wallets.balances); }
  history<T = Record<string, unknown>>() { return this.get<T>(endpoints.histories); }

  intent<T = Record<string, unknown>>(kind: ExecutionKind, id: string) { return this.get<T>(executionIntentPath(kind, id)); }
  prepareIntent<T = PreparedSolanaIntent>(kind: ExecutionKind, id: string) {
    return this.post<T>(executionPreparePath(kind, id), {}, `${kind}:prepare`);
  }
  submitIntent<T = Record<string, unknown>>(kind: ExecutionKind, id: string, signedTransactionBase64: string) {
    return this.post<T>(executionSubmitPath(kind, id), { signedTransactionBase64 }, `${kind}:submit`);
  }
}

export const powerchain = new PowerChainClient();
