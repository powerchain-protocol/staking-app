import 'server-only';
import type { SwapQuote } from '@powerchain/core';
import { env, ConfigurationError } from '@/lib/server/config';
import { integrationGet } from '@/lib/clients/http';

export async function meteoraPools() {
  const base = env.meteoraApiUrl || 'https://dlmm-api.meteora.ag';
  return integrationGet<unknown[]>('meteora', new URL('/pair/all', base).toString());
}

export async function meteoraQuote(inputMint: string, outputMint: string, amountAtomic: string, slippageBps = 50): Promise<SwapQuote> {
  if (!env.meteoraApiUrl) throw new ConfigurationError('METEORA_API_URL must point to the approved Meteora quote service for native Meteora execution');
  const u = new URL('/quote', env.meteoraApiUrl);
  for (const [k,v] of Object.entries({ inputMint, outputMint, amount: amountAtomic, slippageBps: String(slippageBps) })) u.searchParams.set(k,v);
  const q:any = await integrationGet('meteora', u.toString());
  if (!q?.outputAmount) throw new Error('Meteora quote service returned no quote');
  return { provider:'METEORA', chain:'SOLANA', inputAsset:inputMint, outputAsset:outputMint, inputAtomic:amountAtomic, expectedOutputAtomic:String(q.outputAmount), minimumOutputAtomic:String(q.minimumOutputAmount ?? q.outputAmount), priceImpactPct:Number(q.priceImpactPct ?? 0), route:q.route, raw:q };
}
