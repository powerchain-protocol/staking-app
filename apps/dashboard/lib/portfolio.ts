import { apiJson } from '@powerchain/api-client';
import type { PortfolioSnapshot } from '@/types/portfolio';
export async function loadPortfolio(){return (await apiJson<{portfolio:PortfolioSnapshot}>('/api/v1/portfolio')).portfolio;}
