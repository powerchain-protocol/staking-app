import type { ExecutionKind, IntentStatus } from './domain';

export type PowerChainActionDomain = 'STAKING'|'GOVERNANCE'|'BONDS'|'TRANSFERS'|'SWAPS'|'CCTP'|'REWARDS'|'AI'|'SYSTEM';
export type PowerChainActionStage = 'CREATE'|'PREPARE'|'SIGN'|'SUBMIT'|'CONFIRM'|'RECONCILE'|'COMPLETE';

export interface ActionDescriptor {
  id: string;
  domain: PowerChainActionDomain;
  method: 'POST'|'PUT'|'PATCH'|'DELETE';
  endpoint: string;
  stateChanging: boolean;
  confirmationRequired: boolean;
  walletSignatureRequired: boolean;
}

export interface IntentExecutionState {
  kind: ExecutionKind;
  intentId: string;
  status: IntentStatus | string;
  stage?: PowerChainActionStage;
  signature?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  updatedAt?: string | null;
}

export interface PreparedSolanaIntent {
  intentId: string;
  transactionBase64: string;
  messageHash: string;
  blockhash?: string;
  lastValidBlockHeight?: number;
  expiresAt: string;
}

export interface RegisteredAction {
  actionId: string;
  title: string;
  description: string;
  method: 'POST'|'PUT'|'PATCH'|'DELETE';
  endpoint: string;
  executionDomain: string | null;
  enabled: boolean;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export interface ActionRegistryResponse { version: '1.0.0'; actions: RegisteredAction[]; }
