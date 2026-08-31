import 'server-only';
import { env, ConfigurationError, assertEmbeddedWalletConfiguration, assertHttpsUrl, assertProductionSecurity, assertSuiCoinType } from './config';
import { canonicalJson, sha256 } from './crypto';

export type ExecutionDomain = 'STAKING' | 'GOVERNANCE' | 'BONDS' | 'BRIDGE' | 'WALLET';

function domainRequirements(domain: ExecutionDomain): Array<[string, string]> {
  const required: Record<ExecutionDomain, Array<[string, string]>> = {
    STAKING: [
      ['PWRC_MINT', env.pwrcMint],
      ['SOLANA_STAKING_PROGRAM_ID', env.stakingProgramId],
      ['PWRC_STAKING_VAULT_TOKEN_ACCOUNT', env.stakingVaultTokenAccount],
      ['PWRC_REWARD_VAULT_TOKEN_ACCOUNT', env.rewardVaultTokenAccount],
    ],
    GOVERNANCE: [
      ['SOLANA_GOVERNANCE_PROGRAM_ID', env.governanceProgramId],
    ],
    BONDS: [
      ['PWRC_MINT', env.pwrcMint],
      ['SOLANA_BONDS_PROGRAM_ID', env.bondsProgramId],
    ],
    BRIDGE: [
      ['PWRC_MINT', env.pwrcMint],
      ['SOLANA_BRIDGE_PROGRAM_ID', env.bridgeProgramId],
      ['PWRC_BRIDGE_RESERVE_TOKEN_ACCOUNT', env.bridgeReserveTokenAccount],
      ['PWRC_BRIDGE_RESERVE_AUTHORITY', env.bridgeReserveAuthority],
      ['SUI_GRPC_URL', env.suiGrpcUrl],
      ['WPWRC_COIN_TYPE', env.wpwrcCoinType],
    ],
    WALLET: [
      ['PWRC_MINT', env.pwrcMint],
    ],
  };
  return required[domain];
}

export function assertExecutionDomainConfigured(domain: ExecutionDomain) {
  const missing = domainRequirements(domain).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new ConfigurationError(`${domain} execution is not configured: ${missing.join(', ')}`);
  if (domain === 'BRIDGE') {
    assertHttpsUrl(env.suiGrpcUrl, 'SUI_GRPC_URL');
    assertSuiCoinType(env.wpwrcCoinType);
  }
}

export function assertExecutionPrerequisitesConfigured() {
  assertProductionSecurity({ prospectiveExecution: true });
  assertExecutionDomainConfigured('STAKING');
  assertExecutionDomainConfigured('GOVERNANCE');
  assertExecutionDomainConfigured('BONDS');
  assertExecutionDomainConfigured('BRIDGE');
  assertExecutionDomainConfigured('WALLET');
  if (env.rewardVaultRequiredForExecution && !env.rewardVaultTokenAccount) throw new ConfigurationError('PWRC_REWARD_VAULT_TOKEN_ACCOUNT is required for execution');
  if (env.heliusWebhookRequired && !env.heliusWebhookAuthToken) throw new ConfigurationError('HELIUS_WEBHOOK_AUTH_TOKEN is required for execution');
  if (!env.workerSecret && !env.cronSecret) throw new ConfigurationError('INTERNAL_WORKER_SECRET or CRON_SECRET is required for reconciliation readiness');
  assertEmbeddedWalletConfiguration();
}

export function assertExecutionEnabled(domain: ExecutionDomain) {
  if (!env.executionEnabled) throw new ConfigurationError('Protocol execution is disabled. Verify /api/v1/system/health and /api/v1/system/readiness before setting EXECUTION_ENABLED=true.');
  assertExecutionPrerequisitesConfigured();
  assertExecutionDomainConfigured(domain);
}

export function executionConfigurationFingerprint() {
  return sha256(canonicalJson({
    version: 1,
    cluster: env.solanaCluster,
    commitment: env.solanaCommitment,
    pwrcMint: env.pwrcMint,
    pwrcDecimals: env.pwrcDecimals,
    expectedTransferFeeBps: env.expectedTransferFeeBps ?? null,
    stakingProgramId: env.stakingProgramId,
    governanceProgramId: env.governanceProgramId,
    bondsProgramId: env.bondsProgramId,
    bridgeProgramId: env.bridgeProgramId,
    stakingVaultTokenAccount: env.stakingVaultTokenAccount,
    rewardVaultTokenAccount: env.rewardVaultTokenAccount,
    bridgeReserveTokenAccount: env.bridgeReserveTokenAccount,
    bridgeReserveAuthority: env.bridgeReserveAuthority,
    suiNetwork: env.suiNetwork,
    suiGrpcUrl: env.suiGrpcUrl,
    wpwrcCoinType: env.wpwrcCoinType,
    wpwrcDecimals: env.wpwrcDecimals,
    embeddedWalletsEnabled: env.embeddedWalletsEnabled,
    embeddedProviderUrl: env.embeddedProviderUrl || null,
    rewardVaultRequiredForExecution: env.rewardVaultRequiredForExecution,
    bridgeRequiredForExecution: env.bridgeRequiredForExecution,
    heliusWebhookRequired: env.heliusWebhookRequired,
  }));
}

export function preparedExpiry() {
  return new Date(Date.now() + env.preparedTransactionTtlSeconds * 1000);
}

export function assertPreparedNotExpired(value: unknown) {
  if (!value) throw new ConfigurationError('Prepared transaction expiry is missing');
  if (new Date(String(value)).getTime() <= Date.now()) {
    const error = new Error('Prepared transaction has expired and must be prepared again') as Error & { code?: string };
    error.code = 'PREPARED_TRANSACTION_EXPIRED';
    throw error;
  }
}
