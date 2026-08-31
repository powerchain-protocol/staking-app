import { ok, route } from '@/lib/server/http';
import { env } from '@/lib/server/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => ok({
  version: '1.0.0',
  executionEnabled: env.executionEnabled,
  auth: { provider: env.authProvider, primaryIdentityRequired: env.requirePrimaryIdentity, betterAuthEnabled: env.betterAuthEnabled },
  ai: { enabled: env.aiEnabled, stateChangesAllowed: env.aiAllowStateChanges, policyVersion: 'ai-security-v1' },
  deploymentTier: env.deploymentTier,
  releaseChannel: env.releaseChannel,
  solanaCluster: env.solanaCluster,
  suiNetwork: env.suiNetwork,
  embeddedWalletsEnabled: env.embeddedWalletsEnabled,
  realtime: {
    enabled: env.realtimeEnabled,
    transport: 'websocket',
    authoritativeState: false,
    publicUrl: env.realtimePublicUrl,
    heartbeatSeconds: env.realtimeHeartbeatSeconds,
    maxSubscriptions: env.realtimeMaxSubscriptions,
  },
  networks: {
    solana: true,
    sui: Boolean(env.suiGrpcUrl && env.wpwrcCoinType),
  },
  bridgeConfigured: Boolean(env.suiGrpcUrl && env.wpwrcCoinType && env.bridgeReserveTokenAccount && env.bridgeProgramId),
}));
