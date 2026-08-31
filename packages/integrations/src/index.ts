import type { IntegrationHealth, IntegrationId, PricePoint, SwapQuote } from '@powerchain/core';

export interface QuoteRequest {
  inputAsset: string;
  outputAsset: string;
  amountAtomic: string;
  slippageBps?: number;
  walletAddress?: string;
}

export interface SwapProvider {
  readonly id: IntegrationId;
  health(): Promise<IntegrationHealth>;
  quote(request: QuoteRequest): Promise<SwapQuote>;
}

export interface PriceProvider {
  readonly id: IntegrationId;
  prices(symbols: string[]): Promise<PricePoint[]>;
}

export interface ExplorerLinkInput {
  kind: 'tx' | 'address' | 'token' | 'object';
  value: string;
  network: string;
}

export interface ExplorerProvider {
  readonly id: IntegrationId;
  url(input: ExplorerLinkInput): string;
}

export interface IntegrationRegistryItem {
  id: IntegrationId;
  enabled: boolean;
  requiredForExecution?: boolean;
  network: string;
  description: string;
}
