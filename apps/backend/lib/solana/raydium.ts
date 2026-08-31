import 'server-only';
import type { SwapQuote } from '@powerchain/core';
import { env } from '@/lib/server/config';
import { integrationGet } from '@/lib/clients/http';

type RaydiumResponse = {
  success?: boolean;
  data?: {
    inputAmount?: string;
    outputAmount?: string;
    otherAmountThreshold?: string;
    priceImpactPct?: number;
    routePlan?: unknown;
  };
};

export async function raydiumQuote(inputMint: string, outputMint: string, amountAtomic: string, slippageBps = 50): Promise<SwapQuote> {
  const u = new URL('/compute/swap-base-in', env.raydiumApiUrl);
  u.searchParams.set('inputMint', inputMint);
  u.searchParams.set('outputMint', outputMint);
  u.searchParams.set('amount', amountAtomic);
  u.searchParams.set('slippageBps', String(slippageBps));
  u.searchParams.set('txVersion', 'V0');
  const response = await integrationGet<RaydiumResponse>('raydium', u.toString());
  if (!response?.success || !response.data?.outputAmount) throw new Error('Raydium returned no quote');
  return {
    provider: 'RAYDIUM',
    chain: 'SOLANA',
    inputAsset: inputMint,
    outputAsset: outputMint,
    inputAtomic: amountAtomic,
    expectedOutputAtomic: String(response.data.outputAmount),
    minimumOutputAtomic: String(response.data.otherAmountThreshold ?? response.data.outputAmount),
    priceImpactPct: Number(response.data.priceImpactPct ?? 0),
    route: response.data.routePlan,
    raw: response,
  };
}
