import { apiJson } from '@powerchain/api-client';
export async function suiscanLink(kind:'tx'|'account'|'object',value:string){return (await apiJson<{url:string}>(`/api/v1/explorer?chain=SUI&kind=${kind}&value=${encodeURIComponent(value)}`)).url;}
