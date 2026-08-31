import 'server-only';
import type { SwapQuote } from '@powerchain/core';
import { env, ConfigurationError } from '@/lib/server/config';
import { integrationGet } from '@/lib/clients/http';

export async function cetusQuote(inputCoinType:string, outputCoinType:string, amountAtomic:string, slippageBps=50):Promise<SwapQuote>{
  if(!env.cetusApiUrl) throw new ConfigurationError('CETUS_API_URL is required for the approved Cetus aggregator service');
  const u=new URL('/quote',env.cetusApiUrl);
  for(const [k,v] of Object.entries({from:inputCoinType,to:outputCoinType,amount:amountAtomic,slippageBps:String(slippageBps)}))u.searchParams.set(k,v);
  const q:any=await integrationGet('cetus',u.toString());
  if(!q?.outputAmount)throw new Error('Cetus returned no quote');
  return {provider:'CETUS',chain:'SUI',inputAsset:inputCoinType,outputAsset:outputCoinType,inputAtomic:amountAtomic,expectedOutputAtomic:String(q.outputAmount),minimumOutputAtomic:String(q.minimumOutputAmount??q.outputAmount),priceImpactPct:Number(q.priceImpactPct??0),route:q.route,raw:q};
}
