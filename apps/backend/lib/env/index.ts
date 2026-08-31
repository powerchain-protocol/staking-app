import 'server-only';
import { env, assertProductionSecurity } from '@/lib/server/config';

export function deploymentEnvironment() {
  return {
    tier: env.deploymentTier,
    releaseChannel: env.releaseChannel,
    solanaCluster: env.solanaCluster,
    suiNetwork: env.suiNetwork,
    executionEnabled: env.executionEnabled,
  } as const;
}

export function validateRuntimeEnvironment(options: { prospectiveExecution?: boolean } = {}) {
  assertProductionSecurity(options);
  if (env.deploymentTier === 'mainnet-beta' && env.nodeEnv !== 'production') {
    throw new Error('mainnet-beta must run with NODE_ENV=production');
  }
  return deploymentEnvironment();
}
