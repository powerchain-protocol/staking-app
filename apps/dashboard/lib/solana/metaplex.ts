import { apiJson } from '@powerchain/api-client';
export async function metaplexAsset(assetId:string){return apiJson<{asset:unknown}>(`/api/v1/integrations/metaplex/assets/${encodeURIComponent(assetId)}`);}
