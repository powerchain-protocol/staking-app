import 'server-only';
import { env } from '@/lib/server/config';
import { integrationGet } from '@/lib/clients/http';

export async function pythPrice(feedId:string){
  const id=feedId.replace(/^0x/,'');
  const u=new URL('/v2/updates/price/latest',env.pythHermesUrl);
  u.searchParams.append('ids[]',id);
  u.searchParams.set('parsed','true');
  const data:any=await integrationGet('pyth',u.toString());
  const p=data?.parsed?.[0]?.price;
  if(!p)throw new Error('Pyth returned no parsed price');
  return {price:Number(p.price)*10**Number(p.expo),conf:Number(p.conf)*10**Number(p.expo),publishTime:Number(p.publish_time)};
}
