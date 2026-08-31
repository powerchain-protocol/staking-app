import 'server-only';
import type { PricePoint } from '@powerchain/core';
import { env } from '@/lib/server/config';
import { cached } from '@/lib/server/cache';
import { integrationGet } from '@/lib/clients/http';
import { canonicalTokens } from '@/lib/data/tokens';
import { birdeyeTokenPrice } from '@/lib/birdeye';

async function coingecko(ids:string[]):Promise<Record<string,number>>{
  if(!env.coingeckoApiKey)return {};
  const u=new URL('/simple/price',env.coingeckoApiUrl);
  u.searchParams.set('ids',ids.join(','));u.searchParams.set('vs_currencies','usd');
  const d:any=await integrationGet('coingecko',u.toString(),{headers:{'x-cg-pro-api-key':env.coingeckoApiKey}});
  return Object.fromEntries(ids.map(id=>[id,Number(d?.[id]?.usd)]).filter(([,v])=>Number.isFinite(v as number)));
}

async function coinmarketcap(ids:string[]):Promise<Record<string,number>>{
  if(!env.coinmarketcapApiKey)return {};
  const u=new URL('/v3/cryptocurrency/quotes/latest',env.coinmarketcapApiUrl);
  u.searchParams.set('id',ids.join(','));u.searchParams.set('convert','USD');
  const d:any=await integrationGet('coinmarketcap',u.toString(),{headers:{'X-CMC_PRO_API_KEY':env.coinmarketcapApiKey}});
  const out:Record<string,number>={};
  for(const id of ids){const row=Array.isArray(d?.data)?d.data.find((x:any)=>String(x.id)===id):d?.data?.[id];const price=Number(row?.quote?.USD?.price);if(Number.isFinite(price))out[id]=price;}
  return out;
}

export async function prices(symbols:string[]):Promise<PricePoint[]>{
  const wanted=canonicalTokens().filter(t=>symbols.includes(t.symbol));
  return cached(`prices:${wanted.map(t=>t.symbol).sort().join(',')}`,env.priceCacheTtlSeconds,async()=>{
    const cgIds=wanted.map(t=>t.coingeckoId).filter(Boolean) as string[];
    const cmcIds=wanted.map(t=>t.coinmarketcapId).filter(Boolean) as string[];
    const [cg,cmc]=await Promise.all([coingecko(cgIds).catch(()=>({})),coinmarketcap(cmcIds).catch(()=>({}))]);
    const now=new Date().toISOString();const points:PricePoint[]=[];
    for(const token of wanted){
      let value:number|undefined;let source='';
      if(token.coingeckoId&&Number.isFinite(cg[token.coingeckoId])){value=cg[token.coingeckoId];source='COINGECKO';}
      else if(token.coinmarketcapId&&Number.isFinite(cmc[token.coinmarketcapId])){value=cmc[token.coinmarketcapId];source='COINMARKETCAP';}
      else if(token.chain==='SOLANA'&&env.birdeyeApiKey){try{value=await birdeyeTokenPrice(token.address);source='BIRDEYE';}catch{}}
      if(value!=null)points.push({symbol:token.symbol,currency:'USD',price:value,source,timestamp:now});
    }
    return points;
  });
}
