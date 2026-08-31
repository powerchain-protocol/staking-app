import { ApiError, ok, route } from '@/lib/server/http';
import { cctpMessages } from '@/lib/integrations/cctp';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=route(async(request:Request)=>{const u=new URL(request.url);const sourceDomain=Number(u.searchParams.get('sourceDomain'));const transactionHash=u.searchParams.get('transactionHash')??'';if(!Number.isInteger(sourceDomain)||sourceDomain<0||transactionHash.length<20)throw new ApiError(400,'INVALID_ARGUMENT','sourceDomain and transactionHash are required');return ok(await cctpMessages(sourceDomain,transactionHash));});
