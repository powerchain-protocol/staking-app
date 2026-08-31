import { apiJson } from '@powerchain/api-client';
export async function loadBirdeyePrice(address:string){return apiJson<{price:number}>(`/api/v1/integrations/birdeye?address=${encodeURIComponent(address)}`);}
