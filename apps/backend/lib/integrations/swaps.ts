import 'server-only';
import type { SwapQuote } from '@powerchain/core';
import { ApiError } from '@/lib/server/http';
import { jupiterQuote } from '@/lib/solana/jupiter';
import { raydiumQuote } from '@/lib/solana/raydium';
import { meteoraQuote } from '@/lib/solana/meteora';
import { orcaQuote } from '@/lib/solana/orca';
import { cetusQuote } from '@/lib/sui/cetus';
import { deepbookQuote } from '@/lib/sui/deepbook';

export type SwapProviderName='JUPITER'|'RAYDIUM'|'METEORA'|'ORCA'|'CETUS'|'DEEPBOOK';

export async function quoteSwap(provider:SwapProviderName,inputAsset:string,outputAsset:string,amountAtomic:string,slippageBps=50):Promise<SwapQuote>{
  if(!/^\d+$/.test(amountAtomic)||BigInt(amountAtomic)<=0n)throw new ApiError(400,'INVALID_AMOUNT','amountAtomic must be a positive unsigned integer');
  if(!Number.isInteger(slippageBps)||slippageBps<1||slippageBps>5000)throw new ApiError(400,'INVALID_SLIPPAGE','slippageBps must be between 1 and 5000');
  switch(provider){
    case'JUPITER':return jupiterQuote(inputAsset,outputAsset,amountAtomic,slippageBps);
    case'RAYDIUM':return raydiumQuote(inputAsset,outputAsset,amountAtomic,slippageBps);
    case'METEORA':return meteoraQuote(inputAsset,outputAsset,amountAtomic,slippageBps);
    case'ORCA':return orcaQuote(inputAsset,outputAsset,amountAtomic,slippageBps);
    case'CETUS':return cetusQuote(inputAsset,outputAsset,amountAtomic,slippageBps);
    case'DEEPBOOK':return deepbookQuote(inputAsset,outputAsset,amountAtomic,slippageBps);
    default:throw new ApiError(400,'INVALID_PROVIDER','Unsupported swap provider');
  }
}
