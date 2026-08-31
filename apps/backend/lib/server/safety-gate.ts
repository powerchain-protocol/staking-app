import 'server-only';
import { db } from './db';
import { env } from './config';
import { ApiError } from './http';
import { assertExecutionEnabled, executionConfigurationFingerprint, type ExecutionDomain } from './execution';
import { assertRuntimeControl } from './controls';

function ageSeconds(value: unknown) {
  const time = new Date(String(value)).getTime();
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - time) / 1000));
}

function stale(code: string, message: string, details?: Record<string, unknown>): never {
  throw new ApiError(503, code, message, details);
}

export async function assertStateChangeSafety(domain: ExecutionDomain) {
  assertExecutionEnabled(domain);
  await assertRuntimeControl(domain);
  if (!env.stateChangeRequireReadiness) return { enforced: false };

  const fingerprint = executionConfigurationFingerprint();
  const [readiness] = await db()`
    SELECT status,details,created_at
    FROM operational_snapshots
    WHERE snapshot_type='READINESS'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!readiness) stale('READINESS_ATTESTATION_REQUIRED', 'No readiness attestation exists. Verify /api/v1/system/readiness before enabling execution.');
  const readinessAge = ageSeconds(readiness.created_at);
  const readinessDetails = (readiness.details ?? {}) as Record<string, unknown>;
  if (String(readiness.status) !== 'HEALTHY') stale('READINESS_UNHEALTHY', 'The latest system readiness attestation is unhealthy', { checkedAt: readiness.created_at });
  if (readinessAge > env.readinessAttestationMaxAgeSeconds) stale('READINESS_ATTESTATION_STALE', 'System readiness attestation is stale', { ageSeconds: readinessAge, maxAgeSeconds: env.readinessAttestationMaxAgeSeconds });
  if (String(readinessDetails.executionConfigFingerprint ?? '') !== fingerprint) stale('READINESS_CONFIGURATION_CHANGED', 'Execution configuration changed after the last healthy readiness verification. Run readiness again before accepting mutations.');

  let rewardCoverageAge: number | null = null;
  if (env.rewardVaultRequiredForExecution) {
    const [reward] = await db()`
      SELECT covered,created_at,available_after_commitments_atomic
      FROM reward_vault_snapshots
      WHERE network='SOLANA' AND vault_address=${env.rewardVaultTokenAccount}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!reward) stale('REWARD_VAULT_ATTESTATION_REQUIRED', 'No reward-vault solvency snapshot exists for the configured reward vault');
    rewardCoverageAge = ageSeconds(reward.created_at);
    if (!reward.covered) stale('REWARD_VAULT_UNDERFUNDED', 'Reward-vault solvency check is not covered', { availableAfterCommitmentsAtomic: String(reward.available_after_commitments_atomic) });
    if (rewardCoverageAge > env.rewardCoverageMaxAgeSeconds) stale('REWARD_VAULT_ATTESTATION_STALE', 'Reward-vault solvency snapshot is stale', { ageSeconds: rewardCoverageAge, maxAgeSeconds: env.rewardCoverageMaxAgeSeconds });
  }

  let bridgeCoverageAge: number | null = null;
  if (env.bridgeRequiredForExecution) {
    const [bridge] = await db()`
      SELECT covered,verification_status,created_at,details
      FROM bridge_reserve_snapshots
      WHERE details->>'reserveAccount'=${env.bridgeReserveTokenAccount}
        AND details->>'bridgeProgramId'=${env.bridgeProgramId}
        AND details->>'wpwrcCoinType'=${env.wpwrcCoinType}
        AND details->>'suiNetwork'=${env.suiNetwork}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!bridge) stale('BRIDGE_RESERVE_ATTESTATION_REQUIRED', 'No PWRC/wPWRC reserve snapshot exists for the configured bridge');
    bridgeCoverageAge = ageSeconds(bridge.created_at);
    if (!bridge.covered || String(bridge.verification_status) !== 'VERIFIED') stale('BRIDGE_RESERVE_UNDERCOLLATERALIZED', 'PWRC/wPWRC bridge reserve coverage is not verified');
    if (bridgeCoverageAge > env.bridgeCoverageMaxAgeSeconds) stale('BRIDGE_RESERVE_ATTESTATION_STALE', 'PWRC/wPWRC reserve snapshot is stale', { ageSeconds: bridgeCoverageAge, maxAgeSeconds: env.bridgeCoverageMaxAgeSeconds });
  }

  return {
    enforced: true,
    readinessAgeSeconds: readinessAge,
    rewardCoverageAgeSeconds: rewardCoverageAge,
    bridgeCoverageAgeSeconds: bridgeCoverageAge,
    executionConfigFingerprint: fingerprint,
  };
}
