import 'server-only';
import { env } from '@/lib/server/config';
export function suiscanUrl(kind:'tx'|'account'|'object', value:string){
  const net=env.suiNetwork==='mainnet'?'mainnet':env.suiNetwork;
  const path=kind==='tx'?`/${net}/tx/${value}`:kind==='object'?`/${net}/object/${value}`:`/${net}/account/${value}`;
  return new URL(path,env.suiscanBaseUrl).toString();
}
