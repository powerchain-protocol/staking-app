import 'server-only';
import { db } from './db';
import { env, assertEmbeddedWalletConfiguration, assertProductionSecurity } from './config';
import { solanaHealth } from './solana';
import { validatePwrcMint } from './pwrc';
import { rewardVaultCoverage } from './rewards';
import { verifyBridgeReserves } from './bridge';
import { verifySolanaPrograms } from './programs';
import { verifyReceiptChain } from './receipts';
import { assertExecutionPrerequisitesConfigured, executionConfigurationFingerprint } from './execution';
import { listRuntimeControls } from './controls';
import { availableProviders } from '@/lib/ai/providers';
import { providerHealth } from '@/lib/ai/provider-health';
import { latestEvalSummary } from '@/lib/ai/evals';
import { AI_MPC_POLICY } from '@/lib/ai/mpc';

const REQUIRED_MIGRATION = '013_realtime_transport.sql';

async function check<T>(name: string, fn: () => Promise<T>) {
  const started = Date.now();
  try { return { name, ok: true, latencyMs: Date.now() - started, data: await fn() }; }
  catch (error) { return { name, ok: false, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) }; }
}

async function migrationHealth() {
  const [row] = await db()`SELECT version,applied_at FROM schema_migrations WHERE version=${REQUIRED_MIGRATION} LIMIT 1`;
  if (!row) throw new Error(`Required database migration ${REQUIRED_MIGRATION} has not been applied`);
  return { version: row.version, appliedAt: row.applied_at };
}

async function workerHealth() {
  const [row] = await db()`SELECT id,status,processed_count,exception_count,finished_at FROM reconciliation_runs WHERE status='COMPLETED' ORDER BY finished_at DESC NULLS LAST LIMIT 1`;
  if (!row) throw new Error('No completed reconciliation run has been recorded');
  const ageSeconds = Math.floor((Date.now() - new Date(row.finished_at).getTime()) / 1000);
  if (ageSeconds > env.reconciliationStaleSeconds) throw new Error(`Reconciliation worker is stale (${ageSeconds}s since last completed run)`);
  return { runId: row.id, ageSeconds, processed: Number(row.processed_count), exceptions: Number(row.exception_count) };
}

async function realtimeTransportHealth() {
  if (!env.realtimeEnabled) return { enabled: false };
  const [row] = await db()`SELECT instance_id,last_seen_at,connections,event_cursor FROM realtime_server_heartbeats ORDER BY last_seen_at DESC LIMIT 1`;
  if (!row) throw new Error('Realtime server heartbeat has not been recorded');
  const ageSeconds = Math.floor((Date.now() - new Date(row.last_seen_at).getTime()) / 1000);
  const maxAgeSeconds = env.realtimeHeartbeatSeconds * 3;
  if (ageSeconds > maxAgeSeconds) throw new Error(`Realtime server is stale (${ageSeconds}s since heartbeat)`);
  return { enabled: true, instanceId: row.instance_id, ageSeconds, maxAgeSeconds, connections: Number(row.connections), eventCursor: String(row.event_cursor) };
}

async function exceptionHealth() {
  const [{ count }] = await db()`SELECT COUNT(*)::int AS count FROM reconciliation_exceptions WHERE resolved_at IS NULL`;
  const value = Number(count);
  if (value > env.maxOpenReconciliationExceptions) throw new Error(`Open reconciliation exceptions exceed policy (${value}/${env.maxOpenReconciliationExceptions})`);
  return { open: value, limit: env.maxOpenReconciliationExceptions };
}


async function runtimeControlHealth(enforceEnabled = false) {
  const controls = await listRuntimeControls();
  const activePauses = (controls as Array<Record<string, any>>).filter((row) => !row.enabled && (!row.expires_at || new Date(row.expires_at).getTime() > Date.now()));
  if (enforceEnabled && activePauses.length) throw new Error(`Execution controls paused: ${activePauses.map((x)=>x.control_key).join(', ')}`);
  return { controls, activePauses: activePauses.map((x)=>({control:x.control_key,reason:x.reason??null,expiresAt:x.expires_at??null})) };
}

async function webhookDeadLetterHealth() {
  const [{ count }] = await db()`SELECT COUNT(*)::int AS count FROM chain_webhook_events WHERE dead_lettered_at IS NOT NULL AND processed_at IS NULL`;
  const value = Number(count);
  if (value > 0) throw new Error(`${value} chain webhook event(s) are dead-lettered`);
  return { deadLettered: value };
}

async function operationalAlertHealth() {
  const rows = await db()`SELECT severity,COUNT(*)::int AS count FROM operational_alerts WHERE resolved_at IS NULL GROUP BY severity`;
  const counts = Object.fromEntries((rows as Array<Record<string,any>>).map((x)=>[String(x.severity),Number(x.count)]));
  if ((counts.CRITICAL ?? 0) > 0) throw new Error(`${counts.CRITICAL} critical operational alert(s) are open`);
  return counts;
}


async function identitySecurityHealth() {
  const clerkSelected = env.authProvider === 'clerk' || env.authProvider === 'hybrid';
  const betterSelected = env.authProvider === 'better-auth' || env.authProvider === 'hybrid';
  if (env.requirePrimaryIdentity && clerkSelected && !env.clerkSecretKey && !env.clerkJwtKey) throw new Error('Clerk verification key is not configured');
  if (betterSelected && env.betterAuthEnabled && env.betterAuthSecret.length < 32) throw new Error('Better Auth secret does not meet policy');
  return {
    provider: env.authProvider,
    requirePrimaryIdentity: env.requirePrimaryIdentity,
    clerkConfigured: !clerkSelected || Boolean(env.clerkSecretKey || env.clerkJwtKey),
    clerkWebhookConfigured: !clerkSelected || Boolean(env.clerkWebhookSigningSecret),
    betterAuthEnabled: env.betterAuthEnabled,
    actionConfirmationRequired: env.actionConfirmationRequired,
  };
}

async function aiSecurityHealth() {
  const providers=availableProviders();
  if (env.aiEnabled && !providers.some((p)=>p.id===env.aiDefaultProvider)) throw new Error(`Default AI provider ${env.aiDefaultProvider} is not configured`);
  if (env.aiMcpGatewayUrl && !env.aiMcpSigningSecret) throw new Error('AI MCP gateway signing secret is not configured');
  const health=await providerHealth();
  if (env.aiEnabled && !health.some((p:any)=>p.health?.state!=='OPEN')) throw new Error('All configured AI provider circuits are open');
  const evals=await latestEvalSummary();
  if (env.aiEvalRequiredForReadiness && (!evals.total || evals.healthy!==true)) throw new Error('AI evaluation release gate is missing or below the configured pass rate');
  return {
    enabled: env.aiEnabled,
    defaultProvider: env.aiDefaultProvider,
    defaultModel: env.aiDefaultModel,
    configuredProviders: providers.map((p)=>p.id),
    providerHealth: health.map((p:any)=>({id:p.id,state:p.health?.state??'UNKNOWN'})),
    providerFallbacks: env.aiProviderFallbacks,
    ragEnabled: true,
    hybridRerank: true,
    minEvidenceScore: env.aiRagMinEvidenceScore,
    evidencePolicy: 'ABSTAIN_WHEN_REQUIRED_EVIDENCE_IS_MISSING',
    zeroHallucinationGuarantee: false,
    mcpGatewayConfigured: Boolean(env.aiMcpGatewayUrl && env.aiMcpSigningSecret),
    mpcSigningAvailableToAi: AI_MPC_POLICY.enabledForAi,
    stateChangesAllowed: false,
    loraAdapters: env.aiLoraAdapters,
    allowedModels: env.aiAllowedModels,
    allowedTools: env.aiAllowedTools,
    promptVersion: env.aiPromptVersion,
    evals,
    policyVersion: 'ai-runtime-v3',
  };
}

async function executionConfiguration(prospective: boolean) {
  assertProductionSecurity({ prospectiveExecution: prospective });
  if (env.executionEnabled || prospective) assertExecutionPrerequisitesConfigured();
  return {
    executionEnabled: env.executionEnabled,
    prospectiveExecutionChecked: prospective,
    stateChangeRequireReadiness: env.stateChangeRequireReadiness,
    workerMode: env.cronSecret ? 'cron' : env.workerSecret ? 'service' : 'none',
    embeddedWalletsEnabled: env.embeddedWalletsEnabled,
    heliusWebhookRequired: env.heliusWebhookRequired,
    rewardVaultRequiredForExecution: env.rewardVaultRequiredForExecution,
    bridgeRequiredForExecution: env.bridgeRequiredForExecution,
  };
}

async function embeddedWalletHealth() {
  assertEmbeddedWalletConfiguration();
  return { enabled: env.embeddedWalletsEnabled, configured: !env.embeddedWalletsEnabled || Boolean(env.embeddedProviderUrl && env.embeddedProviderApiKey) };
}

async function heliusWebhookHealth() {
  if (env.heliusWebhookRequired && !env.heliusWebhookAuthToken) throw new Error('HELIUS_WEBHOOK_AUTH_TOKEN is required');
  return { required: env.heliusWebhookRequired, authHeaderConfigured: Boolean(env.heliusWebhookAuthToken) };
}

export async function systemHealth(deep = false) {
  const fingerprint = executionConfigurationFingerprint();
  const checks: Array<Record<string, any>> = [
    await check('configuration', () => executionConfiguration(deep)),
    await check('database', async () => { const [row] = await db()`SELECT 1 AS ok`; return { ok: Number(row.ok) === 1 }; }),
    await check('database_migrations', migrationHealth),
  ];

  // Health is intentionally a lightweight service/dependency signal. Execution readiness
  // performs the expensive chain, solvency, worker and operational safety checks below.
  if (!deep) {
    const ok = checks.every((item) => item.ok);
    return {
      ok, kind: 'HEALTH', version: '1.0.0', executionEnabled: env.executionEnabled,
      cluster: env.solanaCluster, uptimeSeconds: Math.floor(process.uptime()), checks,
      checkedAt: new Date().toISOString(),
    };
  }

  checks.push(await check('identity_security', identitySecurityHealth));
  checks.push(await check('realtime_transport', realtimeTransportHealth));
  checks.push(await check('ai_security', aiSecurityHealth));
  checks.push(await check('solana_rpc', solanaHealth));
  checks.push(await check('pwrc_token_2022', validatePwrcMint));
  checks.push(await check('embedded_wallets', embeddedWalletHealth));
  checks.push(await check('helius_webhook', heliusWebhookHealth));
  checks.push(await check('runtime_controls', () => runtimeControlHealth(true)));
  checks.push(await check('solana_programs', () => verifySolanaPrograms({ requireAll: true })));
  checks.push(await check('receipt_chain', () => verifyReceiptChain(10_000)));
  checks.push(await check('reconciliation_exceptions', exceptionHealth));
  checks.push(await check('reconciliation_worker', workerHealth));
  checks.push(await check('webhook_dead_letters', webhookDeadLetterHealth));
  checks.push(await check('operational_alerts', operationalAlertHealth));
  if (env.rewardVaultRequiredForExecution) checks.push(await check('reward_vault', rewardVaultCoverage));
  if (env.bridgeRequiredForExecution) checks.push(await check('bridge_reserves', verifyBridgeReserves));

  const ok = checks.every((item) => item.ok);
  const result = {
    ok,
    kind: 'READINESS',
    version: '1.0.0',
    executionEnabled: env.executionEnabled,
    prospectiveExecutionChecked: true,
    executionConfigFingerprint: fingerprint,
    cluster: env.solanaCluster,
    checks,
    checkedAt: new Date().toISOString(),
  };

  try {
    await db()`INSERT INTO operational_snapshots(snapshot_type,status,details) VALUES('READINESS',${ok ? 'HEALTHY' : 'UNHEALTHY'},${db().json(result as any)})`;
    await db()`DELETE FROM operational_snapshots WHERE created_at < now()-interval '30 days'`;
  } catch {}
  return result;
}
