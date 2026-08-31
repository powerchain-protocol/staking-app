import 'server-only';
import type { SwapQuote } from '@powerchain/core';
import { env, ConfigurationError } from '@/lib/server/config';
import { integrationGet } from '@/lib/clients/http';

export async function deepbookQuote(inputCoinType:string,outputCoinType:string,amountAtomic:string,slippageBps=50):Promise<SwapQuote>{
  if(!env.deepbookApiUrl)throw new ConfigurationError('DEEPBOOK_API_URL is required for the approved DeepBook quote/indexing service');
  const u=new URL('/quote',env.deepbookApiUrl);
  for(const [k,v] of Object.entries({from:inputCoinType,to:outputCoinType,amount:amountAtomic,slippageBps:String(slippageBps)}))u.searchParams.set(k,v);
  const q:any=await integrationGet('deepbook',u.toString());
  if(!q?.outputAmount)throw new Error('DeepBook returned no quote');
  return {provider:'DEEPBOOK',chain:'SUI',inputAsset:inputCoinType,outputAsset:outputCoinType,inputAtomic:amountAtomic,expectedOutputAtomic:String(q.outputAmount),minimumOutputAtomic:String(q.minimumOutputAmount??q.outputAmount),priceImpactPct:Number(q.priceImpactPct??0),route:q.route,raw:q};
}
