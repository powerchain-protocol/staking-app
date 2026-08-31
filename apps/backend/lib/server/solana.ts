import 'server-only';
import { Connection, PublicKey } from '@solana/web3.js';
import { env, ConfigurationError } from './config';

let connection: Connection | null = null;

export function solanaRpcUrl() {
  if (env.solanaRpcUrl) return env.solanaRpcUrl;
  if (env.heliusApiKey) {
    const cluster = env.solanaCluster === 'mainnet-beta' ? 'mainnet' : env.solanaCluster;
    return `https://${cluster}.helius-rpc.com/?api-key=${encodeURIComponent(env.heliusApiKey)}`;
  }
  if (env.nodeEnv === 'production') throw new ConfigurationError('SOLANA_RPC_URL or HELIUS_API_KEY is required for production');
  if (env.solanaCluster === 'mainnet-beta') return 'https://api.mainnet-beta.solana.com';
  if (env.solanaCluster === 'testnet') return 'https://api.testnet.solana.com';
  return 'https://api.devnet.solana.com';
}

export function solanaConnection() {
  if (!connection) connection = new Connection(solanaRpcUrl(), { commitment: env.solanaCommitment, confirmTransactionInitialTimeout: 60_000 });
  return connection;
}

export function publicKey(value: string, field = 'public key') {
  try { return new PublicKey(value); }
  catch { throw new ConfigurationError(`Invalid ${field}: ${value || '(empty)'}`); }
}

export async function solanaHealth() {
  const rpc = solanaConnection();
  const [version, slot, blockHeight] = await Promise.all([rpc.getVersion(), rpc.getSlot(env.solanaCommitment), rpc.getBlockHeight(env.solanaCommitment)]);
  return { cluster: env.solanaCluster, rpc: env.solanaRpcUrl ? 'configured' : env.heliusApiKey ? 'helius' : 'public-development-fallback', version, slot, blockHeight };
}
