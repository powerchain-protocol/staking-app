import 'server-only';
import { env, ConfigurationError } from '@/lib/server/config';
import { integrationPost } from '@/lib/clients/http';

export async function getAssetById(assetId: string) {
  if (!env.metaplexDasUrl) throw new ConfigurationError('METAPLEX_DAS_URL is not configured');
  return integrationPost<any>('metaplex', env.metaplexDasUrl, {
    jsonrpc:'2.0', id:'powerchain-metaplex', method:'getAsset', params:{ id:assetId },
  });
}
