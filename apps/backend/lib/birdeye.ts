import 'server-only';
import { env, ConfigurationError } from '@/lib/server/config';
import { integrationGet } from '@/lib/clients/http';

export async function birdeyeTokenPrice(address:string){
  if(!env.birdeyeApiKey)throw new ConfigurationError('BIRDEYE_API_KEY is not configured');
  const u=new URL('/defi/price',env.birdeyeApiUrl);u.searchParams.set('address',address);
  const data:any=await integrationGet('birdeye',u.toString(),{headers:{'X-API-KEY':env.birdeyeApiKey,'x-chain':'solana'}});
  const value=Number(data?.data?.value);
  if(!Number.isFinite(value))throw new Error('Birdeye returned no price');
  return value;
}
