import 'server-only';
import { Connection, PublicKey } from '@solana/web3.js';
import { env, ConfigurationError } from '@/lib/server/config';

let connection: Connection | null = null;

export function solanaRpcUrl() {
  if (env.solanaRpcUrl) return env.solanaRpcUrl;
  if (env.heliusApiKey) {
    const cluster = env.solanaCluster === 'mainnet-beta' ? 'mainnet' : env.solanaCluster;
    return `https://${cluster}.helius-rpc.com/?api-key=${encodeURIComponent(env.heliusApiKey)}`;
  }
  if (env.nodeEnv === 'production') throw new ConfigurationError('Dedicated Solana RPC is required in production');
  return env.solanaCluster === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';
}

export function solanaConnection() {
  const url = solanaRpcUrl();
  if (!connection || connection.rpcEndpoint !== url) connection = new Connection(url, env.solanaCommitment);
  return connection;
}

export function publicKey(value: string, field = 'address') {
  try { return new PublicKey(value); }
  catch { throw new Error(`${field} is not a valid Solana public key`); }
}

export function explorerClusterQuery() {
  return env.solanaCluster === 'mainnet-beta' ? '' : `?cluster=${env.solanaCluster}`;
}
