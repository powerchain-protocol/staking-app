import 'server-only';

export type SolanaCluster = 'mainnet-beta' | 'devnet' | 'testnet';

function boolEnv(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

function intEnv(name: string, fallback?: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

function boundedIntEnv(name: string, fallback: number, min: number, max: number) {
  const value = intEnv(name, fallback) ?? fallback;
  if (value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return value;
}

function enumEnv<T extends string>(name: string, fallback: T, values: readonly T[]): T {
  const raw = (process.env[name] ?? fallback).trim() as T;
  if (!values.includes(raw)) throw new Error(`${name} must be one of: ${values.join(', ')}`);
  return raw;
}

function unsignedBigIntEnv(name: string, fallback = '0') {
  const raw = (process.env[name] ?? fallback).trim();
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an unsigned integer`);
  return BigInt(raw);
}

function urlEnv(name: string) {
  return (process.env[name] ?? '').trim();
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:3001',
  sessionSecret: process.env.SESSION_SECRET ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
  workerSecret: process.env.INTERNAL_WORKER_SECRET ?? '',
  cronSecret: process.env.CRON_SECRET ?? '',
  executionEnabled: boolEnv('EXECUTION_ENABLED', false),
  stateChangeRequireReadiness: boolEnv('STATE_CHANGE_REQUIRE_READINESS', true),
  readinessAttestationMaxAgeSeconds: boundedIntEnv('READINESS_ATTESTATION_MAX_AGE_SECONDS', 120, 15, 3600),
  rewardCoverageMaxAgeSeconds: boundedIntEnv('REWARD_COVERAGE_MAX_AGE_SECONDS', 120, 15, 3600),
  bridgeCoverageMaxAgeSeconds: boundedIntEnv('BRIDGE_COVERAGE_MAX_AGE_SECONDS', 120, 15, 3600),
  rewardVaultRequiredForExecution: boolEnv('REWARD_VAULT_REQUIRED_FOR_EXECUTION', true),
  bridgeRequiredForExecution: boolEnv('BRIDGE_REQUIRED_FOR_EXECUTION', true),
  heliusWebhookRequired: boolEnv('HELIUS_WEBHOOK_REQUIRED', true),
  preparedTransactionTtlSeconds: boundedIntEnv('PREPARED_TRANSACTION_TTL_SECONDS', 90, 30, 600),
  reconciliationBatchSize: boundedIntEnv('RECONCILIATION_BATCH_SIZE', 100, 1, 1000),
  reconciliationLeaseSeconds: boundedIntEnv('RECONCILIATION_LEASE_SECONDS', 120, 30, 900),
  reconciliationStaleSeconds: boundedIntEnv('RECONCILIATION_STALE_SECONDS', 180, 60, 3600),
  maxOpenReconciliationExceptions: boundedIntEnv('MAX_OPEN_RECONCILIATION_EXCEPTIONS', 10, 0, 1000),
  autoPauseOnReconciliationExceptions: boolEnv('AUTO_PAUSE_ON_RECONCILIATION_EXCEPTIONS', true),
  webhookMaxProcessingAttempts: boundedIntEnv('WEBHOOK_MAX_PROCESSING_ATTEMPTS', 8, 1, 50),
  webhookRetryBaseSeconds: boundedIntEnv('WEBHOOK_RETRY_BASE_SECONDS', 15, 1, 3600),
  heliusWebhookAuthToken: process.env.HELIUS_WEBHOOK_AUTH_TOKEN ?? '',
  governanceExecutionDelaySeconds: boundedIntEnv('GOVERNANCE_EXECUTION_DELAY_SECONDS', 86400, 0, 2592000),
  receiptSealSecret: process.env.RECEIPT_SEAL_SECRET ?? '',

  realtimeEnabled: boolEnv('REALTIME_ENABLED', true),
  realtimePort: boundedIntEnv('REALTIME_PORT', 4001, 1024, 65535),
  realtimeHost: process.env.REALTIME_HOST ?? '0.0.0.0',
  realtimePublicUrl: urlEnv('REALTIME_PUBLIC_URL') || 'ws://localhost:4001',
  realtimeSigningSecret: process.env.REALTIME_SIGNING_SECRET ?? '',
  realtimeTokenTtlSeconds: boundedIntEnv('REALTIME_TOKEN_TTL_SECONDS', 60, 15, 300),
  realtimeHeartbeatSeconds: boundedIntEnv('REALTIME_HEARTBEAT_SECONDS', 25, 10, 120),
  realtimeMaxSubscriptions: boundedIntEnv('REALTIME_MAX_SUBSCRIPTIONS', 16, 1, 32),
  realtimeMaxConnectionsPerSubject: boundedIntEnv('REALTIME_MAX_CONNECTIONS_PER_SUBJECT', 4, 1, 16),
  realtimeMaxMessagesPerMinute: boundedIntEnv('REALTIME_MAX_MESSAGES_PER_MINUTE', 120, 10, 600),
  realtimeMaxPayloadBytes: boundedIntEnv('REALTIME_MAX_PAYLOAD_BYTES', 65536, 1024, 262144),
  realtimeEventRetentionHours: boundedIntEnv('REALTIME_EVENT_RETENTION_HOURS', 24, 1, 168),

  solanaCluster: enumEnv<SolanaCluster>('SOLANA_CLUSTER', 'devnet', ['mainnet-beta','devnet','testnet']),
  solanaRpcUrl: urlEnv('SOLANA_RPC_URL'),
  heliusApiKey: process.env.HELIUS_API_KEY ?? '',
  solanaCommitment: enumEnv<'confirmed'|'finalized'>('SOLANA_COMMITMENT', 'confirmed', ['confirmed','finalized']),

  pwrcMint: process.env.PWRC_MINT ?? '',
  pwrcDecimals: boundedIntEnv('PWRC_DECIMALS', 9, 0, 18),
  requireRevokedMintAuthority: boolEnv('PWRC_REQUIRE_REVOKED_MINT_AUTHORITY', true),
  requireRevokedFreezeAuthority: boolEnv('PWRC_REQUIRE_REVOKED_FREEZE_AUTHORITY', true),
  expectedTransferFeeBps: process.env.PWRC_EXPECTED_TRANSFER_FEE_BPS ? boundedIntEnv('PWRC_EXPECTED_TRANSFER_FEE_BPS', 0, 0, 10000) : undefined,
  expectedTransferFeeMaxAtomic: process.env.PWRC_EXPECTED_TRANSFER_FEE_MAX_ATOMIC ? unsignedBigIntEnv('PWRC_EXPECTED_TRANSFER_FEE_MAX_ATOMIC') : null,
  requireRevokedTransferFeeConfigAuthority: boolEnv('PWRC_REQUIRE_REVOKED_TRANSFER_FEE_CONFIG_AUTHORITY', false),
  requireRevokedWithdrawWithheldAuthority: boolEnv('PWRC_REQUIRE_REVOKED_WITHDRAW_WITHHELD_AUTHORITY', false),
  allowedPwrcExtensions: (process.env.PWRC_ALLOWED_EXTENSIONS ?? '').split(',').map((x) => x.trim()).filter(Boolean),
  bondUnbondingDays: boundedIntEnv('BOND_UNBONDING_DAYS', 7, 0, 3650),

  stakingProgramId: process.env.SOLANA_STAKING_PROGRAM_ID ?? '',
  governanceProgramId: process.env.SOLANA_GOVERNANCE_PROGRAM_ID ?? '',
  bondsProgramId: process.env.SOLANA_BONDS_PROGRAM_ID ?? '',
  bridgeProgramId: process.env.SOLANA_BRIDGE_PROGRAM_ID ?? '',

  stakingVaultTokenAccount: process.env.PWRC_STAKING_VAULT_TOKEN_ACCOUNT ?? '',
  rewardVaultTokenAccount: process.env.PWRC_REWARD_VAULT_TOKEN_ACCOUNT ?? '',
  bridgeReserveTokenAccount: process.env.PWRC_BRIDGE_RESERVE_TOKEN_ACCOUNT ?? '',
  bridgeReserveAuthority: process.env.PWRC_BRIDGE_RESERVE_AUTHORITY ?? '',
  bridgeRequireNoDelegate: boolEnv('BRIDGE_REQUIRE_NO_DELEGATE', true),
  bridgeRequireNoCloseAuthority: boolEnv('BRIDGE_REQUIRE_NO_CLOSE_AUTHORITY', true),

  suiNetwork: process.env.SUI_NETWORK ?? 'mainnet',
  suiGrpcUrl: urlEnv('SUI_GRPC_URL'),
  wpwrcCoinType: (process.env.WPWRC_COIN_TYPE ?? '').trim(),
  wpwrcDecimals: boundedIntEnv('WPWRC_DECIMALS', 9, 0, 18),
  bridgeReserveToleranceAtomic: unsignedBigIntEnv('BRIDGE_RESERVE_TOLERANCE_ATOMIC', '0'),

  embeddedWalletsEnabled: boolEnv('EMBEDDED_WALLETS_ENABLED', false),
  embeddedProviderUrl: urlEnv('EMBEDDED_WALLET_PROVIDER_URL'),
  embeddedProviderApiKey: process.env.EMBEDDED_WALLET_PROVIDER_API_KEY ?? '',
  embeddedProviderWebhookSecret: process.env.EMBEDDED_WALLET_PROVIDER_WEBHOOK_SECRET ?? '',


  deploymentTier: enumEnv<'devnet'|'mainnet-beta'>('DEPLOYMENT_TIER', 'devnet', ['devnet','mainnet-beta']),
  releaseChannel: enumEnv<'beta'|'stable'>('RELEASE_CHANNEL', 'beta', ['beta','stable']),
  mainnetBetaAck: process.env.MAINNET_BETA_ACK ?? '',
  apiCorsOrigins: (process.env.API_CORS_ORIGINS ?? '').split(',').map((x) => x.trim()).filter(Boolean),
  integrationHealthTtlSeconds: boundedIntEnv('INTEGRATION_HEALTH_TTL_SECONDS', 60, 5, 3600),
  priceCacheTtlSeconds: boundedIntEnv('PRICE_CACHE_TTL_SECONDS', 30, 5, 600),

  supabaseUrl: urlEnv('SUPABASE_URL'),
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'powerchain-private',

  jupiterApiUrl: urlEnv('JUPITER_API_URL') || 'https://api.jup.ag',
  jupiterApiKey: process.env.JUPITER_API_KEY ?? '',
  meteoraApiUrl: urlEnv('METEORA_API_URL'),
  orcaApiUrl: urlEnv('ORCA_API_URL'),
  raydiumApiUrl: urlEnv('RAYDIUM_API_URL') || 'https://transaction-v1.raydium.io',
  cetusApiUrl: urlEnv('CETUS_API_URL'),
  deepbookApiUrl: urlEnv('DEEPBOOK_API_URL'),

  pythHermesUrl: urlEnv('PYTH_HERMES_URL') || 'https://hermes.pyth.network',
  birdeyeApiUrl: urlEnv('BIRDEYE_API_URL') || 'https://public-api.birdeye.so',
  birdeyeApiKey: process.env.BIRDEYE_API_KEY ?? '',
  coingeckoApiUrl: urlEnv('COINGECKO_API_URL') || 'https://pro-api.coingecko.com/api/v3',
  coingeckoApiKey: process.env.COINGECKO_API_KEY ?? '',
  coinmarketcapApiUrl: urlEnv('COINMARKETCAP_API_URL') || 'https://pro-api.coinmarketcap.com',
  coinmarketcapApiKey: process.env.COINMARKETCAP_API_KEY ?? '',

  solscanBaseUrl: urlEnv('SOLSCAN_BASE_URL') || 'https://solscan.io',
  suiscanBaseUrl: urlEnv('SUISCAN_BASE_URL') || 'https://suiscan.xyz',
  metaplexDasUrl: urlEnv('METAPLEX_DAS_URL'),

  cctpIrisUrl: urlEnv('CCTP_IRIS_URL') || ((process.env.DEPLOYMENT_TIER ?? 'devnet') === 'mainnet-beta' ? 'https://iris-api.circle.com' : 'https://iris-api-sandbox.circle.com'),
  cctpSourceDomainId: intEnv('CCTP_SOURCE_DOMAIN_ID', 5),
  cctpDestinationDomainId: intEnv('CCTP_DESTINATION_DOMAIN_ID'),
  cctpUsdcMint: process.env.CCTP_USDC_MINT ?? '',
  cctpUsdcDecimals: boundedIntEnv('CCTP_USDC_DECIMALS', 6, 0, 18),
  cctpMessageTransmitterProgramId: process.env.CCTP_MESSAGE_TRANSMITTER_PROGRAM_ID ?? 'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC',
  cctpTokenMessengerMinterProgramId: process.env.CCTP_TOKEN_MESSENGER_MINTER_PROGRAM_ID ?? 'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe',
  cctpMinFinalityThreshold: boundedIntEnv('CCTP_MIN_FINALITY_THRESHOLD', 2000, 0, 10000),
  cctpFastFinalityThreshold: boundedIntEnv('CCTP_FAST_FINALITY_THRESHOLD', 1000, 0, 10000),
  cctpFeeBufferBps: boundedIntEnv('CCTP_FEE_BUFFER_BPS', 2000, 0, 10000),
  cctpMaxFeeAtomic: process.env.CCTP_MAX_FEE_ATOMIC ? unsignedBigIntEnv('CCTP_MAX_FEE_ATOMIC') : null,
  cctpDestinationPrepareUrl: urlEnv('CCTP_DESTINATION_PREPARE_URL'),
  cctpDestinationPrepareApiKey: process.env.CCTP_DESTINATION_PREPARE_API_KEY ?? '',

  maxSwapSlippageBps: boundedIntEnv('MAX_SWAP_SLIPPAGE_BPS', 300, 1, 5000),
  swapQuoteTtlSeconds: boundedIntEnv('SWAP_QUOTE_TTL_SECONDS', 30, 5, 300),
  enabledSwapProviders: (process.env.ENABLED_SWAP_PROVIDERS ?? 'JUPITER,RAYDIUM,METEORA,ORCA,CETUS,DEEPBOOK').split(',').map((x)=>x.trim().toUpperCase()).filter(Boolean),
  indexerBatchSize: boundedIntEnv('INDEXER_BATCH_SIZE', 100, 1, 1000),
  indexerLoopSeconds: boundedIntEnv('INDEXER_LOOP_SECONDS', 60, 10, 3600),

  zkEnabled: boolEnv('ZK_ENABLED', false),
  zkVerifierUrl: urlEnv('ZK_VERIFIER_URL'),
  zkVerifierApiKey: process.env.ZK_VERIFIER_API_KEY ?? '',

  authProvider: enumEnv<'clerk'|'better-auth'|'hybrid'>('AUTH_PROVIDER','clerk',['clerk','better-auth','hybrid']),
  requirePrimaryIdentity: boolEnv('REQUIRE_PRIMARY_IDENTITY', true),
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? '',
  clerkJwtKey: (process.env.CLERK_JWT_KEY ?? '').replace(/\\n/g,'\n'),
  clerkWebhookSigningSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET ?? '',
  clerkAuthorizedParties: (process.env.CLERK_AUTHORIZED_PARTIES ?? process.env.APP_ORIGIN ?? 'http://localhost:3001').split(',').map((x)=>x.trim()).filter(Boolean),
  betterAuthEnabled: boolEnv('BETTER_AUTH_ENABLED', false),
  betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? '',
  betterAuthUrl: urlEnv('BETTER_AUTH_URL') || 'http://localhost:4000',
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '', googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  githubClientId: process.env.GITHUB_CLIENT_ID ?? '', githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
  appleClientId: process.env.APPLE_CLIENT_ID ?? '', appleClientSecret: process.env.APPLE_CLIENT_SECRET ?? '',
  actionConfirmationRequired: boolEnv('ACTION_CONFIRMATION_REQUIRED', true),
  actionConfirmationTtlSeconds: boundedIntEnv('ACTION_CONFIRMATION_TTL_SECONDS', 180, 30, 900),
  actionConfirmationTokenTtlSeconds: boundedIntEnv('ACTION_CONFIRMATION_TOKEN_TTL_SECONDS', 180, 30, 900),
  mailEnabled: boolEnv('MAIL_ENABLED', false),
  mailFrom: process.env.MAIL_FROM ?? '',
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  aiEnabled: boolEnv('AI_ENABLED', false),
  aiGatewayUrl: urlEnv('AI_GATEWAY_URL'),
  aiGatewayApiKey: process.env.AI_GATEWAY_API_KEY ?? '',
  aiGatewaySigningSecret: process.env.AI_GATEWAY_SIGNING_SECRET ?? '',
  aiAllowedModels: (process.env.AI_ALLOWED_MODELS ?? 'powerchain-copilot').split(',').map((x)=>x.trim()).filter(Boolean),
  aiAllowedTools: (process.env.AI_ALLOWED_TOOLS ?? 'portfolio.read,staking.read,rewards.read,governance.read,network.read,bridge.reserve.read,solana.rpc.health,solana.token.validate,rag.search').split(',').map((x)=>x.trim()).filter(Boolean),
  aiAllowedProviders: (process.env.AI_ALLOWED_PROVIDERS ?? 'gateway').split(',').map((x)=>x.trim()).filter(Boolean),
  aiAllowStateChanges: boolEnv('AI_ALLOW_STATE_CHANGES', false),
  aiMaxInputBytes: boundedIntEnv('AI_MAX_INPUT_BYTES', 32768, 1024, 1048576),
  aiMaxOutputBytes: boundedIntEnv('AI_MAX_OUTPUT_BYTES', 262144, 1024, 4194304),
  aiRequestsPerMinute: boundedIntEnv('AI_REQUESTS_PER_MINUTE', 20, 1, 600),
  aiTimeoutMs: boundedIntEnv('AI_TIMEOUT_MS', 30000, 1000, 120000),
  aiMaxTokens: boundedIntEnv('AI_MAX_TOKENS', 2048, 128, 32768),
  aiMaxHistoryBytes: boundedIntEnv('AI_MAX_HISTORY_BYTES', 65536, 0, 524288),
  aiDefaultProvider: enumEnv<'gateway'|'openai'|'anthropic'|'deepseek'|'local'|'ollama'|'vllm'>('AI_DEFAULT_PROVIDER','gateway',['gateway','openai','anthropic','deepseek','local','ollama','vllm']),
  aiDefaultModel: process.env.AI_DEFAULT_MODEL ?? 'powerchain-copilot',
  aiOpenAiBaseUrl: urlEnv('AI_OPENAI_BASE_URL') || 'https://api.openai.com/v1',
  aiOpenAiApiKey: process.env.AI_OPENAI_API_KEY ?? '',
  aiAnthropicBaseUrl: urlEnv('AI_ANTHROPIC_BASE_URL') || 'https://api.anthropic.com',
  aiAnthropicApiKey: process.env.AI_ANTHROPIC_API_KEY ?? '',
  aiDeepseekBaseUrl: urlEnv('AI_DEEPSEEK_BASE_URL') || 'https://api.deepseek.com',
  aiDeepseekApiKey: process.env.AI_DEEPSEEK_API_KEY ?? '',
  aiLocalBaseUrl: urlEnv('AI_LOCAL_BASE_URL'),
  aiLocalApiKey: process.env.AI_LOCAL_API_KEY ?? '',
  aiOllamaBaseUrl: urlEnv('AI_OLLAMA_BASE_URL'),
  aiVllmBaseUrl: urlEnv('AI_VLLM_BASE_URL'),
  aiVllmApiKey: process.env.AI_VLLM_API_KEY ?? '',
  aiLoraAdapters: (process.env.AI_LORA_ADAPTERS ?? '').split(',').map((x)=>x.trim()).filter(Boolean),
  aiMcpGatewayUrl: urlEnv('AI_MCP_GATEWAY_URL'),
  aiMcpSigningSecret: process.env.AI_MCP_SIGNING_SECRET ?? '',
  aiToolTimeoutMs: boundedIntEnv('AI_TOOL_TIMEOUT_MS', 12000, 1000, 60000),
  aiRagMaxResults: boundedIntEnv('AI_RAG_MAX_RESULTS', 8, 1, 16),
  aiRagCandidateLimit: boundedIntEnv('AI_RAG_CANDIDATE_LIMIT', 24, 4, 64),
  aiRagMinEvidenceScore: Number(process.env.AI_RAG_MIN_EVIDENCE_SCORE ?? '0.30'),
  aiMaxToolCalls: boundedIntEnv('AI_MAX_TOOL_CALLS', 8, 0, 16),
  aiProviderFallbacks: (process.env.AI_PROVIDER_FALLBACKS ?? '').split(',').map((x)=>x.trim()).filter(Boolean),
  aiProviderFailureThreshold: boundedIntEnv('AI_PROVIDER_FAILURE_THRESHOLD', 3, 1, 20),
  aiProviderOpenSeconds: boundedIntEnv('AI_PROVIDER_OPEN_SECONDS', 60, 5, 3600),
  aiEvalMinPassRate: Number(process.env.AI_EVAL_MIN_PASS_RATE ?? '0.95'),
  aiEvalRequiredForReadiness: boolEnv('AI_EVAL_REQUIRED_FOR_READINESS', false),
  aiPromptVersion: process.env.AI_PROMPT_VERSION ?? 'powerchain-ai-runtime-v3',
  aiConversationRetentionDays: boundedIntEnv('AI_CONVERSATION_RETENTION_DAYS', 90, 1, 3650),
  aiFeedbackRetentionDays: boundedIntEnv('AI_FEEDBACK_RETENTION_DAYS', 365, 1, 3650),

  governanceProposerWallets: (process.env.GOVERNANCE_PROPOSER_WALLETS ?? '').split(',').map((x) => x.trim()).filter(Boolean),
  stakingAdminWallets: (process.env.STAKING_ADMIN_WALLETS ?? '').split(',').map((x) => x.trim()).filter(Boolean),
  bondAdminWallets: (process.env.BOND_ADMIN_WALLETS ?? '').split(',').map((x) => x.trim()).filter(Boolean),
};

export function assertConfigured(name: keyof typeof env, message?: string) {
  const value = env[name];
  if (value === '' || value == null) throw new ConfigurationError(message ?? `${String(name)} is not configured`);
  return value as Exclude<typeof value, '' | null | undefined>;
}

export function assertHttpsUrl(value: string, name: string) {
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new ConfigurationError(`${name} must be a valid URL`); }
  if (env.nodeEnv === 'production' && parsed.protocol !== 'https:') throw new ConfigurationError(`${name} must use https in production`);
  return parsed;
}

export function assertSuiCoinType(value: string, name = 'WPWRC_COIN_TYPE') {
  const parts = value.split('::');
  if (parts.length !== 3 || !/^0x[0-9a-fA-F]+$/.test(parts[0]) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(parts[1]) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(parts[2])) {
    throw new ConfigurationError(`${name} must be a Sui Move coin type in 0xPACKAGE::module::TYPE format`);
  }
  return value;
}

export function assertEmbeddedWalletConfiguration() {
  if (!env.embeddedWalletsEnabled) return;
  if (!env.embeddedProviderUrl || !env.embeddedProviderApiKey) {
    throw new ConfigurationError('Embedded wallets are enabled but EMBEDDED_WALLET_PROVIDER_URL or EMBEDDED_WALLET_PROVIDER_API_KEY is missing');
  }
  assertHttpsUrl(env.embeddedProviderUrl, 'EMBEDDED_WALLET_PROVIDER_URL');
  if (env.nodeEnv === 'production' && !env.embeddedProviderWebhookSecret) {
    throw new ConfigurationError('EMBEDDED_WALLET_PROVIDER_WEBHOOK_SECRET is required when embedded wallets are enabled in production');
  }
}

export function assertProductionSecurity(options: { prospectiveExecution?: boolean } = {}) {
  const forExecution = env.executionEnabled || options.prospectiveExecution === true;
  if (env.nodeEnv === 'production') {
    if (env.sessionSecret.length < 32) throw new ConfigurationError('SESSION_SECRET must be at least 32 characters in production');
    if (env.realtimeEnabled && (env.realtimeSigningSecret || env.sessionSecret).length < 32) throw new ConfigurationError('REALTIME_SIGNING_SECRET or SESSION_SECRET must be at least 32 characters when realtime is enabled');
    if (env.realtimeEnabled) { const realtime = new URL(env.realtimePublicUrl); if (realtime.protocol !== 'wss:') throw new ConfigurationError('REALTIME_PUBLIC_URL must use wss in production'); }
    const appOrigin = assertHttpsUrl(env.appOrigin, 'APP_ORIGIN');
    if (appOrigin.pathname !== '/' || appOrigin.search || appOrigin.hash) throw new ConfigurationError('APP_ORIGIN must be an origin URL without path, query, or fragment');
    if (!env.databaseUrl) throw new ConfigurationError('DATABASE_URL is required in production');
    if (env.requirePrimaryIdentity && env.authProvider !== 'better-auth' && !env.clerkSecretKey && !env.clerkJwtKey) throw new ConfigurationError('CLERK_SECRET_KEY or CLERK_JWT_KEY is required when Clerk identity is enabled');
    if (env.requirePrimaryIdentity && env.authProvider !== 'better-auth' && !env.clerkWebhookSigningSecret) throw new ConfigurationError('CLERK_WEBHOOK_SIGNING_SECRET is required for production Clerk identity synchronization');
    if (env.authProvider === 'better-auth' && !env.betterAuthEnabled) throw new ConfigurationError('BETTER_AUTH_ENABLED=true is required when AUTH_PROVIDER=better-auth');
    if (env.betterAuthEnabled && env.betterAuthSecret.length < 32) throw new ConfigurationError('BETTER_AUTH_SECRET must be at least 32 characters when Better Auth is enabled');
    if (env.mailEnabled && (!env.mailFrom || !env.resendApiKey)) throw new ConfigurationError('MAIL_FROM and RESEND_API_KEY are required when mail is enabled');
    if (env.aiEnabled && env.aiDefaultProvider === 'gateway' && (!env.aiGatewayUrl || !env.aiGatewaySigningSecret)) throw new ConfigurationError('AI_GATEWAY_URL and AI_GATEWAY_SIGNING_SECRET are required when gateway AI is enabled');
    if (env.aiEnabled && env.aiDefaultProvider === 'gateway') assertHttpsUrl(env.aiGatewayUrl, 'AI_GATEWAY_URL');
    if (env.aiEnabled && env.aiDefaultProvider === 'openai' && !env.aiOpenAiApiKey) throw new ConfigurationError('AI_OPENAI_API_KEY is required for the OpenAI provider');
    if (env.aiEnabled && env.aiDefaultProvider === 'anthropic' && !env.aiAnthropicApiKey) throw new ConfigurationError('AI_ANTHROPIC_API_KEY is required for the Anthropic provider');
    if (env.aiEnabled && env.aiDefaultProvider === 'deepseek' && !env.aiDeepseekApiKey) throw new ConfigurationError('AI_DEEPSEEK_API_KEY is required for the DeepSeek provider');
    if (env.aiEnabled && env.aiDefaultProvider === 'local' && !env.aiLocalBaseUrl) throw new ConfigurationError('AI_LOCAL_BASE_URL is required for the local provider');
    if (env.aiEnabled && env.aiDefaultProvider === 'ollama' && !env.aiOllamaBaseUrl) throw new ConfigurationError('AI_OLLAMA_BASE_URL is required for the Ollama provider');
    if (env.aiEnabled && env.aiDefaultProvider === 'vllm' && !env.aiVllmBaseUrl) throw new ConfigurationError('AI_VLLM_BASE_URL is required for the vLLM provider');
    if (env.aiEnabled && !env.aiAllowedProviders.includes(env.aiDefaultProvider)) throw new ConfigurationError('AI_DEFAULT_PROVIDER must be included in AI_ALLOWED_PROVIDERS');
    if (env.aiEnabled && !env.aiAllowedModels.includes(env.aiDefaultModel)) throw new ConfigurationError('AI_DEFAULT_MODEL must be included in AI_ALLOWED_MODELS');
    if (!Number.isFinite(env.aiRagMinEvidenceScore) || env.aiRagMinEvidenceScore < 0 || env.aiRagMinEvidenceScore > 1) throw new ConfigurationError('AI_RAG_MIN_EVIDENCE_SCORE must be between 0 and 1');
    if (!Number.isFinite(env.aiEvalMinPassRate) || env.aiEvalMinPassRate < 0 || env.aiEvalMinPassRate > 1) throw new ConfigurationError('AI_EVAL_MIN_PASS_RATE must be between 0 and 1');
    for (const fallback of env.aiProviderFallbacks) if (!env.aiAllowedProviders.includes(fallback)) throw new ConfigurationError('AI_PROVIDER_FALLBACKS entries must be included in AI_ALLOWED_PROVIDERS');
    for (const adapter of env.aiLoraAdapters) if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(adapter)) throw new ConfigurationError('AI_LORA_ADAPTERS entries must be logical IDs, not filesystem paths');
    if (env.aiMcpGatewayUrl) { assertHttpsUrl(env.aiMcpGatewayUrl,'AI_MCP_GATEWAY_URL'); if (!env.aiMcpSigningSecret) throw new ConfigurationError('AI_MCP_SIGNING_SECRET is required when MCP gateway is configured'); }
    if (env.betterAuthEnabled) assertHttpsUrl(env.betterAuthUrl, 'BETTER_AUTH_URL');
    if (!env.solanaRpcUrl && !env.heliusApiKey) throw new ConfigurationError('A dedicated SOLANA_RPC_URL or HELIUS_API_KEY is required in production');
    if (forExecution && !env.receiptSealSecret) throw new ConfigurationError('RECEIPT_SEAL_SECRET is required for production execution readiness');
    if (forExecution && !env.workerSecret && !env.cronSecret) throw new ConfigurationError('INTERNAL_WORKER_SECRET or CRON_SECRET is required for production execution readiness');
  }
  if (forExecution) {
    if (env.deploymentTier === 'mainnet-beta' && env.mainnetBetaAck !== 'POWERCHAIN_MAINNET_BETA') {
      throw new ConfigurationError('MAINNET_BETA_ACK=POWERCHAIN_MAINNET_BETA is required before mainnet-beta execution can be enabled');
    }
    if (env.solanaCluster !== env.deploymentTier) {
      throw new ConfigurationError('SOLANA_CLUSTER must match DEPLOYMENT_TIER for execution readiness');
    }
    if (env.rewardVaultRequiredForExecution && !env.rewardVaultTokenAccount) throw new ConfigurationError('PWRC_REWARD_VAULT_TOKEN_ACCOUNT is required for execution readiness');
    if (env.bridgeRequiredForExecution) {
      if (!env.suiGrpcUrl) throw new ConfigurationError('SUI_GRPC_URL is required for PWRC/wPWRC bridge readiness');
      if (!env.wpwrcCoinType) throw new ConfigurationError('WPWRC_COIN_TYPE is required for PWRC/wPWRC bridge readiness');
      assertHttpsUrl(env.suiGrpcUrl, 'SUI_GRPC_URL');
      assertSuiCoinType(env.wpwrcCoinType);
    }
    if (env.heliusWebhookRequired && !env.heliusWebhookAuthToken) throw new ConfigurationError('HELIUS_WEBHOOK_AUTH_TOKEN is required for execution readiness');
    if (env.cctpSourceDomainId === 5 && !env.cctpUsdcMint) throw new ConfigurationError('CCTP_USDC_MINT is required for Solana CCTP execution readiness');
    if (env.cctpDestinationPrepareUrl) assertHttpsUrl(env.cctpDestinationPrepareUrl, 'CCTP_DESTINATION_PREPARE_URL');
    assertEmbeddedWalletConfiguration();
  }
}

export class ConfigurationError extends Error {
  code = 'CONFIGURATION_ERROR';
}
