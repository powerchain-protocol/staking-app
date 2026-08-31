import 'server-only';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import type { PortfolioAsset, PortfolioSnapshot } from '@powerchain/core';
import { db } from '@/lib/server/db';
import { env } from '@/lib/server/config';
import { solanaConnection } from '@/lib/server/solana';
import { suiClient } from '@/lib/sui/sui';
import { prices } from '@/lib/prices';
import { atomicToUi } from '@/lib/utils/calculators';

export async function buildPortfolio(subjectId:string):Promise<PortfolioSnapshot>{
  const links=await db()<{
    wallet_address:string;network:'SOLANA'|'SUI';is_primary:boolean;
  }[]>`SELECT wallet_address,network,is_primary FROM wallet_links WHERE subject_id=${subjectId} ORDER BY is_primary DESC,created_at ASC`;
  const assets:PortfolioAsset[]=[];
  for(const link of links){
    if(link.network==='SOLANA'){
      const connection=solanaConnection();const owner=new PublicKey(link.wallet_address);
      const [lamports]=await Promise.all([connection.getBalance(owner,env.solanaCommitment)]);
      assets.push({chain:'SOLANA',symbol:'SOL',address:'So11111111111111111111111111111111111111112',amountAtomic:String(lamports),decimals:9,amountUi:String(lamports/LAMPORTS_PER_SOL),source:'SOLANA_RPC'});
      if(env.pwrcMint){
        const mint=new PublicKey(env.pwrcMint);const ata=getAssociatedTokenAddressSync(mint,owner,false,TOKEN_2022_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID);
        const info=await connection.getAccountInfo(ata,env.solanaCommitment);
        if(info){const acc=await getAccount(connection,ata,env.solanaCommitment,TOKEN_2022_PROGRAM_ID);assets.push({chain:'SOLANA',symbol:'PWRC',address:env.pwrcMint,amountAtomic:acc.amount.toString(),decimals:env.pwrcDecimals,amountUi:atomicToUi(acc.amount,env.pwrcDecimals),source:'TOKEN_2022'});}
      }
    }else if(env.wpwrcCoinType){
      const balance=await suiClient().getBalance({owner:link.wallet_address,coinType:env.wpwrcCoinType});
      const atomic=String(balance.balance.balance??'0');
      assets.push({chain:'SUI',symbol:'wPWRC',address:env.wpwrcCoinType,amountAtomic:atomic,decimals:env.wpwrcDecimals,amountUi:atomicToUi(atomic,env.wpwrcDecimals),source:'SUI_GRPC'});
    }
  }
  const [staked]=await db()<[{total:string}]>`SELECT COALESCE(SUM(principal_atomic),0)::text AS total FROM staking_positions WHERE subject_id=${subjectId} AND status IN ('ACTIVE','LOCKED','UNBONDING','WITHDRAWABLE')`;
  if(BigInt(staked?.total??'0')>0n)assets.push({chain:'SOLANA',symbol:'staked PWRC',address:'staking:PWRC',amountAtomic:staked.total,decimals:env.pwrcDecimals,amountUi:atomicToUi(staked.total,env.pwrcDecimals),source:'STAKING_INDEX'});
  const pricePoints=await prices(['SOL','PWRC']).catch(()=>[]);
  const bySymbol=new Map(pricePoints.map(p=>[p.symbol,p.price]));
  let totalValueUsd=0;
  for(const asset of assets){
    const baseSymbol=asset.symbol==='staked PWRC'||asset.symbol==='wPWRC'?'PWRC':asset.symbol;
    const price=bySymbol.get(baseSymbol);if(price!=null){asset.priceUsd=price;asset.valueUsd=Number(asset.amountUi)*price;totalValueUsd+=asset.valueUsd;}
  }
  const wallet=links.find(x=>x.is_primary)?.wallet_address??links[0]?.wallet_address??'';
  const snapshot={subjectId,walletAddress:wallet,generatedAt:new Date().toISOString(),totalValueUsd,assets};
  if(wallet)await db()`INSERT INTO portfolio_snapshots(subject_id,wallet_address,network,total_value_usd,assets) VALUES(${subjectId},${wallet},'MULTI',${totalValueUsd},${JSON.stringify(assets)}::jsonb)`;
  return snapshot;
}
