import { apiJson } from '@powerchain/api-client';
export async function cetusQuote(inputAsset:string,outputAsset:string,amountAtomic:string,slippageBps=50){return apiJson<{quote:unknown}>('/api/v1/swaps/quote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:'CETUS',inputAsset,outputAsset,amountAtomic,slippageBps})});}
