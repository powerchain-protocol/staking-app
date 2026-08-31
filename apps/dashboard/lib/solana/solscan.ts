import { apiJson } from '@powerchain/api-client';
export async function solscanLink(kind:'tx'|'account'|'token',value:string){return (await apiJson<{url:string}>(`/api/v1/explorer?chain=SOLANA&kind=${kind}&value=${encodeURIComponent(value)}`)).url;}
