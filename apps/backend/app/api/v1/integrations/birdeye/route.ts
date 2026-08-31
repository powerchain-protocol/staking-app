import { ApiError,ok,route } from '@/lib/server/http';import { birdeyeTokenPrice } from '@/lib/birdeye';
export const runtime='nodejs';export const GET=route(async(request:Request)=>{const address=new URL(request.url).searchParams.get('address')??'';if(!address)throw new ApiError(400,'INVALID_ARGUMENT','address is required');return ok({price:await birdeyeTokenPrice(address)});});
