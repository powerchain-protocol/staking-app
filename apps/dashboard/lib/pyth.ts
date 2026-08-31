import { apiJson } from '@powerchain/api-client';
export async function loadPythPrice(feedId:string){return apiJson<{price:number;confidence?:number}>(`/api/v1/integrations/pyth?feedId=${encodeURIComponent(feedId)}`);}
