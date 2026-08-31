import 'server-only';
import { env } from '@/lib/server/config';
export function solscanUrl(kind:'tx'|'account'|'token', value:string) {
  const path = kind === 'tx' ? `/tx/${value}` : kind === 'token' ? `/token/${value}` : `/account/${value}`;
  const u = new URL(path, env.solscanBaseUrl);
  if (env.solanaCluster !== 'mainnet-beta') u.searchParams.set('cluster', env.solanaCluster);
  return u.toString();
}
