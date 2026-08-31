import { apiJson } from '@powerchain/api-client';
import type { LinkedWallet } from '@/types/wallets';
export async function loadWallets(){return (await apiJson<{wallets:LinkedWallet[]}>('/api/v1/wallets')).wallets;}
