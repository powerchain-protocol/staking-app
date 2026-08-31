import { env } from '@/lib/server/config';
import { isValidWalletAddress, randomToken } from '@/lib/server/crypto';
import { db } from '@/lib/server/db';
import { jsonBody, ok, requireString, route, ApiError } from '@/lib/server/http';
import { enforceRateLimit, rateLimitKey, requestIp } from '@/lib/server/rate-limit';
import { getPlatformIdentity, requirePlatformIdentity } from '@/lib/auth/identity';

export const runtime = 'nodejs';

export const POST = route(async (request: Request) => {
  const identity = env.requirePrimaryIdentity ? await requirePlatformIdentity(request) : await getPlatformIdentity(request);
  await enforceRateLimit(rateLimitKey('auth-challenge-ip',requestIp(request)),30,60);
  const body = await jsonBody<Record<string, unknown>>(request);
  const wallet = requireString(body.wallet, 'wallet', 128);
  const network = requireString(body.network ?? 'SOLANA', 'network', 16).toUpperCase();
  if (network !== 'SOLANA' && network !== 'SUI') throw new ApiError(400, 'INVALID_NETWORK', 'network must be SOLANA or SUI');
  if (!isValidWalletAddress(network, wallet)) throw new ApiError(400, 'INVALID_WALLET', `wallet is not a valid ${network} address`);
  await enforceRateLimit(rateLimitKey('auth-challenge-wallet',`${network}:${wallet}`),6,60);
  const requestOrigin = request.headers.get('origin') ?? env.appOrigin;
  if (env.nodeEnv === 'production' && requestOrigin !== env.appOrigin) throw new ApiError(403, 'ORIGIN_MISMATCH', 'Wallet authentication origin is not allowed');
  const nonce = randomToken(24);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 3 * 60_000);
  const cluster = network === 'SOLANA' ? env.solanaCluster : env.suiNetwork;
  const message = [
    'PowerChain Staking wallet authentication',
    `Account: ${identity?.subjectId ?? 'wallet-only'}`,
    `Wallet: ${wallet}`,
    `Network: ${network}`,
    `Cluster: ${cluster}`,
    `Origin: ${requestOrigin}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expires At: ${expiresAt.toISOString()}`,
    'Purpose: Authenticate this wallet to PowerChain Staking. This does not authorize a transaction.',
  ].join('\n');
  const [challenge] = await db()`
    INSERT INTO auth_challenges(subject_id,wallet_address, network, nonce, message, origin, cluster, issued_at, expires_at)
    VALUES(${identity?.subjectId ?? null},${wallet},${network},${nonce},${message},${requestOrigin},${cluster},${issuedAt},${expiresAt}) RETURNING id
  `;
  return ok({ challengeId: challenge.id, message, issuedAt, expiresAt, network, cluster });
});
