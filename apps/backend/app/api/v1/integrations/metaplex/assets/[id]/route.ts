import { ok,route } from '@/lib/server/http';import { getAssetById } from '@/lib/solana/metaplex';
export const runtime='nodejs';export const GET=route(async(_r:Request,{params}:{params:Promise<{id:string}>})=>{const{id}=await params;return ok({asset:await getAssetById(id)});});
