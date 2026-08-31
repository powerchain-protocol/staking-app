import 'server-only';
import { env, ConfigurationError, assertEmbeddedWalletConfiguration } from './config';
import { ApiError } from './http';

export type EmbeddedWalletOperation = 'CREATE_WALLET' | 'SIGN_MESSAGE' | 'SIGN_TRANSACTION';

export async function createEmbeddedSigningSession(input: {
  operation: EmbeddedWalletOperation;
  subjectId: string;
  network: 'SOLANA' | 'SUI';
  walletAddress?: string | null;
  payload?: string | null;
  returnUrl: string;
}) {
  if (!env.embeddedWalletsEnabled) throw new ConfigurationError('Embedded wallets are disabled. Set EMBEDDED_WALLETS_ENABLED=true only after configuring the provider.');
  assertEmbeddedWalletConfiguration();
  const response = await fetch(`${env.embeddedProviderUrl.replace(/\/$/, '')}/v1/signing-sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.embeddedProviderApiKey}` },
    body: JSON.stringify({
      application: 'powerchain-staking',
      subjectId: input.subjectId,
      operation: input.operation,
      network: input.network,
      walletAddress: input.walletAddress ?? undefined,
      payload: input.payload ?? undefined,
      returnUrl: input.returnUrl,
      requireUserPresence: true,
      exportablePrivateKey: false,
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new ApiError(502, 'EMBEDDED_WALLET_PROVIDER_ERROR', 'Embedded-wallet provider rejected the signing-session request', { status: response.status });
  const data = await response.json() as Record<string, unknown>;
  if (typeof data.sessionId !== 'string' || typeof data.url !== 'string') throw new ApiError(502, 'EMBEDDED_WALLET_PROVIDER_INVALID_RESPONSE', 'Embedded-wallet provider returned an invalid signing-session response');
  return data;
}

export async function verifyEmbeddedProviderSession(sessionToken: string) {
  if (!env.embeddedWalletsEnabled) throw new ConfigurationError('Embedded wallets are disabled');
  assertEmbeddedWalletConfiguration();
  const response = await fetch(`${env.embeddedProviderUrl.replace(/\/$/, '')}/v1/signing-sessions/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.embeddedProviderApiKey}` },
    body: JSON.stringify({ application: 'powerchain-staking', sessionToken }),
    cache: 'no-store',
  });
  if (!response.ok) throw new ApiError(401, 'EMBEDDED_WALLET_SESSION_INVALID', 'Embedded-wallet provider could not verify the completion token');
  const data = await response.json() as Record<string, unknown>;
  if (typeof data.subjectId !== 'string' || typeof data.walletAddress !== 'string' || typeof data.network !== 'string') throw new ApiError(502, 'EMBEDDED_WALLET_PROVIDER_INVALID_RESPONSE', 'Embedded-wallet verification response is incomplete');
  return data;
}
