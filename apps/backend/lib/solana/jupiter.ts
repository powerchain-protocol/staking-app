import 'server-only';
import { createJupiterApiClient } from '@jup-ag/api';
import type { SwapQuote } from '@powerchain/core';
import { env } from '@/lib/server/config';
import { cached } from '@/lib/server/cache';

function api() {
  return createJupiterApiClient({
    basePath: env.jupiterApiUrl,
    apiKey: env.jupiterApiKey || undefined,
  } as any);
}

export async function jupiterQuote(inputMint: string, outputMint: string, amountAtomic: string, slippageBps = 50): Promise<SwapQuote> {
  const key = `jupiter:${inputMint}:${outputMint}:${amountAtomic}:${slippageBps}`;
  return cached(key, 5, async () => {
    const quote = await api().quoteGet({
      inputMint,
      outputMint,
      amount: amountAtomic,
      slippageBps,
      swapMode: 'ExactIn',
      restrictIntermediateTokens: true,
    } as any);
    if (!quote?.outAmount) throw new Error('Jupiter returned no executable quote');
    return {
      provider: 'JUPITER',
      chain: 'SOLANA',
      inputAsset: inputMint,
      outputAsset: outputMint,
      inputAtomic: amountAtomic,
      expectedOutputAtomic: String(quote.outAmount),
      minimumOutputAtomic: String((quote as any).otherAmountThreshold ?? quote.outAmount),
      priceImpactPct: Number((quote as any).priceImpactPct ?? 0),
      route: (quote as any).routePlan ?? [],
      raw: quote,
    };
  });
}

export async function jupiterSwapTransaction(quoteResponse: unknown, userPublicKey: string) {
  return api().swapPost({
    swapRequest: {
      quoteResponse: quoteResponse as any,
      userPublicKey,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto' as any,
    },
  } as any);
}
