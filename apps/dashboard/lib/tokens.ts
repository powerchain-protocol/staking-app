import { apiJson } from '@powerchain/api-client';
export interface TokenRow{chain:'SOLANA'|'SUI';symbol:string;name:string;decimals:number;address:string;logoUrl?:string}
export async function loadTokens(){const r=await apiJson<{tokens:TokenRow[]}>('/api/v1/tokens');return r.tokens;}
