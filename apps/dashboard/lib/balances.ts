import { apiJson } from '@powerchain/api-client';
export async function loadBalances(){return apiJson<Record<string,unknown>>('/api/v1/wallets/balances');}
