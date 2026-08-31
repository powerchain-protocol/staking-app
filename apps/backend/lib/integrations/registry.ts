import 'server-only';
import type { IntegrationHealth, IntegrationId, IntegrationRegistryItem } from '@powerchain/core';
import { env } from '@/lib/server/config';
import { cached } from '@/lib/server/cache';
import { integrationGet } from '@/lib/clients/http';

export function integrationRegistry():IntegrationRegistryItem[]{
  const net=`solana:${env.solanaCluster}/sui:${env.suiNetwork}`;
  return [
    {id:'helius',enabled:Boolean(env.heliusApiKey||env.solanaRpcUrl),requiredForExecution:true,network:env.solanaCluster,description:'Solana RPC and webhook indexing'},
    {id:'jupiter',enabled:true,network:env.solanaCluster,description:'Solana route discovery and swap preparation'},
    {id:'meteora',enabled:Boolean(env.meteoraApiUrl),network:env.solanaCluster,description:'Meteora DLMM native quote service'},
    {id:'orca',enabled:Boolean(env.orcaApiUrl),network:env.solanaCluster,description:'Orca Whirlpools native quote service'},
    {id:'raydium',enabled:Boolean(env.raydiumApiUrl),network:env.solanaCluster,description:'Raydium Trade API'},
    {id:'solana-pay',enabled:true,network:env.solanaCluster,description:'Solana Pay URLs and requests'},
    {id:'metaplex',enabled:Boolean(env.metaplexDasUrl),network:env.solanaCluster,description:'Metaplex DAS assets'},
    {id:'cctp',enabled:env.cctpSourceDomainId!=null&&env.cctpDestinationDomainId!=null&&Boolean(env.cctpUsdcMint),network:net,description:'Circle CCTP V2'},
    {id:'cetus',enabled:Boolean(env.cetusApiUrl),network:env.suiNetwork,description:'Cetus Sui aggregator'},
    {id:'deepbook',enabled:Boolean(env.deepbookApiUrl),network:env.suiNetwork,description:'DeepBook Sui liquidity'},
    {id:'pyth',enabled:Boolean(env.pythHermesUrl),network:net,description:'Pyth Hermes prices'},
    {id:'birdeye',enabled:Boolean(env.birdeyeApiKey),network:net,description:'Birdeye market data'},
    {id:'coingecko',enabled:Boolean(env.coingeckoApiKey),network:'global',description:'CoinGecko market data'},
    {id:'coinmarketcap',enabled:Boolean(env.coinmarketcapApiKey),network:'global',description:'CoinMarketCap market data'},
    {id:'solscan',enabled:true,network:env.solanaCluster,description:'Solana explorer links'},
    {id:'suiscan',enabled:true,network:env.suiNetwork,description:'Sui explorer links'},
    {id:'zk',enabled:env.zkEnabled&&Boolean(env.zkVerifierUrl),network:net,description:'External zero-knowledge proof verification'},
  ];
}

export async function integrationHealth():Promise<IntegrationHealth[]>{
  return cached('integration-health',env.integrationHealthTtlSeconds,async()=>{
    const now=new Date().toISOString();
    return integrationRegistry().map(item=>({
      id:item.id,
      mode:item.enabled?'enabled':'unconfigured',
      network:item.network,
      checkedAt:now,
      detail:item.enabled?'Adapter configured; endpoint-specific operations perform authoritative health checks':'Not configured',
    } as IntegrationHealth));
  });
}
