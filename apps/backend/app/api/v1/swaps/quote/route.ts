import { ApiError, jsonBody, ok, requireString, route } from '@/lib/server/http';
import { quoteSwap, type SwapProviderName } from '@/lib/integrations/swaps';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const POST=route(async(request:Request)=>{
  const b=await jsonBody<Record<string,unknown>>(request);const provider=requireString(b.provider,'provider',16).toUpperCase() as SwapProviderName;const inputAsset=requireString(b.inputAsset,'inputAsset',256);const outputAsset=requireString(b.outputAsset,'outputAsset',256);const amountAtomic=requireString(b.amountAtomic,'amountAtomic',80);const slippageBps=Number(b.slippageBps??50);
  if(inputAsset===outputAsset)throw new ApiError(400,'SAME_ASSET','Input and output assets must differ');
  return ok({quote:await quoteSwap(provider,inputAsset,outputAsset,amountAtomic,slippageBps)});
});
