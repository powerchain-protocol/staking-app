import 'server-only';
import { env, ConfigurationError } from '@/lib/server/config';
import { integrationGet } from '@/lib/clients/http';

export async function cctpMessages(sourceDomainId:number, transactionHash:string){
  if(!Number.isInteger(sourceDomainId)||sourceDomainId<0)throw new Error('Invalid CCTP source domain');
  const u=new URL(`/v2/messages/${sourceDomainId}`,env.cctpIrisUrl);
  u.searchParams.set('transactionHash',transactionHash);
  return integrationGet<any>('cctp',u.toString());
}
export async function cctpFees(sourceDomainId:number,destinationDomainId:number){
  const u=new URL(`/v2/burn/USDC/fees/${sourceDomainId}/${destinationDomainId}`,env.cctpIrisUrl);
  return integrationGet<any>('cctp',u.toString());
}
export function assertCctpConfigured(){
  if(env.cctpSourceDomainId==null||env.cctpDestinationDomainId==null||!env.cctpUsdcMint)throw new ConfigurationError('CCTP source domain, destination domain, and USDC mint must be configured');
  if(!env.cctpMessageTransmitterProgramId||!env.cctpTokenMessengerMinterProgramId)throw new ConfigurationError('CCTP V2 Solana program IDs must be configured');
}
