export type DeploymentTier = 'devnet' | 'mainnet-beta';
export type SolanaCluster = 'devnet' | 'mainnet-beta';
export type SuiNetwork = 'devnet' | 'testnet' | 'mainnet';
export type ReleaseChannel = 'beta' | 'stable';

export type IntegrationId =
  | 'jupiter' | 'meteora' | 'orca' | 'raydium'
  | 'cetus' | 'deepbook'
  | 'pyth' | 'birdeye' | 'coingecko' | 'coinmarketcap'
  | 'cctp' | 'solana-pay' | 'helius' | 'metaplex'
  | 'solscan' | 'suiscan' | 'zk';

export type IntegrationMode = 'enabled' | 'disabled' | 'degraded' | 'unconfigured';

export interface IntegrationHealth {
  id: IntegrationId;
  mode: IntegrationMode;
  network: string;
  checkedAt: string;
  latencyMs?: number;
  detail?: string;
}

export interface TokenDescriptor {
  chain: 'SOLANA' | 'SUI';
  symbol: string;
  name: string;
  decimals: number;
  address: string;
  logoUrl?: string;
  coingeckoId?: string;
  coinmarketcapId?: string;
}

export interface PricePoint {
  symbol: string;
  currency: 'USD';
  price: number;
  source: string;
  timestamp: string;
  confidence?: number;
  stale?: boolean;
}

export interface SwapQuote {
  provider: 'JUPITER' | 'METEORA' | 'ORCA' | 'RAYDIUM' | 'CETUS' | 'DEEPBOOK';
  chain: 'SOLANA' | 'SUI';
  inputAsset: string;
  outputAsset: string;
  inputAtomic: string;
  expectedOutputAtomic: string;
  minimumOutputAtomic?: string;
  priceImpactPct?: number;
  feeAtomic?: string;
  route?: unknown;
  expiresAt?: string;
  raw?: unknown;
}

export interface PortfolioAsset {
  chain: 'SOLANA' | 'SUI';
  symbol: string;
  address: string;
  amountAtomic: string;
  decimals: number;
  amountUi: string;
  priceUsd?: number;
  valueUsd?: number;
  source: string;
}

export interface PortfolioSnapshot {
  subjectId: string;
  walletAddress: string;
  generatedAt: string;
  totalValueUsd: number;
  assets: PortfolioAsset[];
}

export interface HistoryItem {
  id: string;
  category: 'STAKING' | 'REWARD' | 'GOVERNANCE' | 'BOND' | 'TRANSFER' | 'BRIDGE' | 'SWAP' | 'AUTH';
  action: string;
  status: string;
  chain?: 'SOLANA' | 'SUI';
  amountAtomic?: string;
  asset?: string;
  txId?: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

export interface LeaderboardEntry {
  rank: number;
  subjectId: string;
  displayName: string;
  score: number;
  stakingScore: number;
  governanceScore: number;
  networkScore: number;
  verified: boolean;
}

export class PowerChainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
  }
}
