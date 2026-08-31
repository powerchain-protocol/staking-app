import 'server-only';
import type { SwapQuote } from '@powerchain/core';
import { env, ConfigurationError } from '@/lib/server/config';
import { integrationGet } from '@/lib/clients/http';

export async function orcaQuote(inputMint: string, outputMint: string, amountAtomic: string, slippageBps = 50): Promise<SwapQuote> {
  if (!env.orcaApiUrl) throw new ConfigurationError('ORCA_API_URL must point to an approved Orca Whirlpools quote service');
  const u = new URL('/quote', env.orcaApiUrl);
  for (const [k,v] of Object.entries({ inputMint, outputMint, amount: amountAtomic, slippageBps: String(slippageBps) })) u.searchParams.set(k,v);
  const q:any = await integrationGet('orca', u.toString());
  if (!q?.outputAmount) throw new Error('Orca quote service returned no quote');
  return { provider:'ORCA', chain:'SOLANA', inputAsset:inputMint, outputAsset:outputMint, inputAtomic:amountAtomic, expectedOutputAtomic:String(q.outputAmount), minimumOutputAtomic:String(q.minimumOutputAmount ?? q.outputAmount), priceImpactPct:Number(q.priceImpactPct ?? 0), route:q.route, raw:q };
}
