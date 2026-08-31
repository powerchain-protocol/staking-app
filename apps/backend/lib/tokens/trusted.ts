import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/server/config';
export type TrustedToken={symbol:string;network:string;environment:string;address:string;decimals:number;category:string;enabled:boolean;source:string};
function resolveAddress(raw:string){if(raw==='${PWRC_MINT}')return env.pwrcMint;if(raw==='${WPWRC_COIN_TYPE}')return env.wpwrcCoinType;if(raw==='${CCTP_USDC_MINT}')return env.cctpUsdcMint;return raw}
export async function trustedTokens(){
  const file=path.join(process.cwd(),'lib/tokens/trusted-tokens.csv');const text=await readFile(file,'utf8');const lines=text.trim().split(/\r?\n/);const rows:TrustedToken[]=[];
  for(const line of lines.slice(1)){const [symbol,network,environment,rawAddress,decimals,category,enabled,source]=line.split(',');if(environment!=='*'&&environment!==env.deploymentTier)continue;const address=resolveAddress(rawAddress);if(!address)continue;rows.push({symbol,network,environment,address,decimals:Number(decimals),category,enabled:enabled==='true',source});}
  return rows;
}
export async function assertTrustedToken(network:string,address:string){const token=(await trustedTokens()).find(x=>x.enabled&&x.network===network&&x.address===address);if(!token)throw new Error(`Token is not in the trusted-token registry for ${env.deploymentTier}: ${network}:${address}`);return token;}
