import { apiJson } from '@powerchain/api-client';
export async function loadAccount(){return apiJson<{account:unknown;wallets:unknown[]}>('/api/v1/accounts');}
