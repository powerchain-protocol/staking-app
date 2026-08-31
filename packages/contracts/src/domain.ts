export type DeploymentTier = 'devnet' | 'mainnet-beta';
export type Chain = 'SOLANA' | 'SUI';
export type ExecutionKind = 'staking' | 'governance' | 'bond' | 'transfer' | 'swap' | 'cctp';
export type RuntimeMode = 'operational' | 'readonly' | 'degraded' | 'offline';
export type SwapProvider = 'JUPITER'|'RAYDIUM'|'METEORA'|'ORCA'|'CETUS'|'DEEPBOOK';
export type IntentStatus =
  | 'QUOTED' | 'READY' | 'AWAITING_SIGNATURE' | 'SUBMITTED' | 'CONFIRMING'
  | 'RECONCILING' | 'RECONCILED' | 'REQUIRES_REVIEW' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

export interface SystemCheck<T = unknown> {
  name: string;
  ok: boolean;
  latencyMs?: number;
  data?: T;
  error?: string;
}

export interface SystemHealthResponse {
  ok?: boolean;
  healthy?: boolean;
  executionEnabled?: boolean;
  mode?: RuntimeMode | string;
  timestamp?: string;
  checkedAt?: string;
  checks?: SystemCheck[];
}

export interface ApiErrorEnvelope {
  error?: { code?: string; message?: string; requestId?: string; details?: unknown };
}

export interface PortfolioResponse {
  subjectId?: string;
  wallet?: string | null;
  balances?: Record<string, unknown>;
  positions?: unknown[];
  rewards?: unknown;
  governance?: unknown;
  [key: string]: unknown;
}
