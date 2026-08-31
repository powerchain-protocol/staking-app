import 'server-only';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { env, assertHttpsUrl, ConfigurationError } from '@/lib/server/config';

let client: SuiGrpcClient | null = null;
export function suiClient() {
  if (!env.suiGrpcUrl) throw new ConfigurationError('SUI_GRPC_URL is required');
  assertHttpsUrl(env.suiGrpcUrl, 'SUI_GRPC_URL');
  if (!client) client = new SuiGrpcClient({ network: env.suiNetwork as any, baseUrl: env.suiGrpcUrl });
  return client;
}
