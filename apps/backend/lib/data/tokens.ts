import type { TokenDescriptor } from '@powerchain/core';
import { env } from '@/lib/server/config';

export function canonicalTokens(): TokenDescriptor[] {
  return [
    { chain:'SOLANA', symbol:'PWRC', name:'PowerChain', decimals:env.pwrcDecimals, address:env.pwrcMint },
    { chain:'SOLANA', symbol:'SOL', name:'Solana', decimals:9, address:'So11111111111111111111111111111111111111112', coingeckoId:'solana', coinmarketcapId:'5426' },
    ...(env.cctpUsdcMint ? [{ chain:'SOLANA' as const, symbol:'USDC', name:'USD Coin', decimals:6, address:env.cctpUsdcMint, coingeckoId:'usd-coin', coinmarketcapId:'3408' }] : []),
    ...(env.wpwrcCoinType ? [{ chain:'SUI' as const, symbol:'wPWRC', name:'Wrapped PowerChain', decimals:env.wpwrcDecimals, address:env.wpwrcCoinType }] : []),
  ];
}
