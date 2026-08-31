import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { db } from '@/lib/server/db';
import { jsonBody, ok, requireString, route, ApiError } from '@/lib/server/http';
import { isValidWalletAddress, sha256, verifySolanaMessage } from '@/lib/server/crypto';
import { setSessionCookie } from '@/lib/server/session';
import { env } from '@/lib/server/config';
import { enforceRateLimit, rateLimitKey, requestIp } from '@/lib/server/rate-limit';
import { getPlatformIdentity, requirePlatformIdentity } from '@/lib/auth/identity';
import { recordPlatformEvent } from '@/lib/events';

export const runtime = 'nodejs';

export const POST = route(async (request: Request) => {
  const identity = env.requirePrimaryIdentity ? await requirePlatformIdentity(request) : await getPlatformIdentity(request);
  await enforceRateLimit(rateLimitKey('auth-verify-ip',requestIp(request)),30,60);
  const body = await jsonBody<Record<string, unknown>>(request);
  const challengeId = requireString(body.challengeId, 'challengeId', 64);
  const wallet = requireString(body.wallet, 'wallet', 128);
  const signature = requireString(body.signature, 'signature', 1024);
  await enforceRateLimit(rateLimitKey('auth-verify-wallet',wallet),10,60);

  const sql = db();
  let network: 'SOLANA' | 'SUI' = 'SOLANA';
  let subject = '';
  await sql.begin(async (tx) => {
    const [challenge] = await tx`SELECT * FROM auth_challenges WHERE id=${challengeId} FOR UPDATE`;
    if (!challenge) throw new ApiError(404, 'CHALLENGE_NOT_FOUND', 'Wallet authentication challenge not found');
    if (challenge.consumed_at) throw new ApiError(409, 'CHALLENGE_CONSUMED', 'Wallet authentication challenge was already used');
    if (new Date(challenge.expires_at) <= new Date()) throw new ApiError(410, 'CHALLENGE_EXPIRED', 'Wallet authentication challenge expired');
    if (challenge.wallet_address !== wallet) throw new ApiError(400, 'WALLET_MISMATCH', 'Wallet does not match the challenge');
    if (challenge.subject_id && identity?.subjectId !== challenge.subject_id) throw new ApiError(403, 'ACCOUNT_MISMATCH', 'Wallet challenge belongs to a different signed-in account');
    const requestOrigin=request.headers.get('origin') ?? env.appOrigin;
    if (String(challenge.origin) !== requestOrigin || (env.nodeEnv === 'production' && requestOrigin !== env.appOrigin)) throw new ApiError(403, 'ORIGIN_MISMATCH', 'Wallet verification origin does not match the signed challenge');
    network = challenge.network as 'SOLANA' | 'SUI';
    if (!isValidWalletAddress(network, wallet)) throw new ApiError(400, 'INVALID_WALLET', `wallet is not a valid ${network} address`);

    let valid = false;
    if (network === 'SOLANA') {
      valid = verifySolanaMessage(wallet, String(challenge.message), signature);
    } else {
      try {
        await verifyPersonalMessageSignature(new TextEncoder().encode(String(challenge.message)), signature, { address: wallet });
        valid = true;
      } catch { valid = false; }
    }
    if (!valid) throw new ApiError(401, 'INVALID_WALLET_SIGNATURE', 'Wallet signature could not be verified');

    const consumed = await tx`UPDATE auth_challenges SET consumed_at=now() WHERE id=${challengeId} AND consumed_at IS NULL RETURNING id`;
    if (consumed.length !== 1) throw new ApiError(409, 'CHALLENGE_CONSUMED', 'Wallet authentication challenge was already used');
    subject = identity?.subjectId ?? `wallet:${network.toLowerCase()}:${sha256(wallet).slice(0, 32)}`;
    await tx`
      INSERT INTO wallet_links(subject_id,wallet_address,network,wallet_kind,is_primary)
      VALUES(${subject},${wallet},${network},'EXTERNAL',true)
      ON CONFLICT(network,wallet_address) DO UPDATE SET verified_at=now(), subject_id=EXCLUDED.subject_id
    `;
    await tx`
      INSERT INTO users(id,primary_wallet,primary_network)
      VALUES(${subject},${wallet},${network})
      ON CONFLICT(id) DO UPDATE SET primary_wallet=EXCLUDED.primary_wallet,primary_network=EXCLUDED.primary_network,updated_at=now()
    `;
    await tx`
      INSERT INTO user_profiles(subject_id,display_name)
      VALUES(${subject},'PowerChain participant')
      ON CONFLICT(subject_id) DO NOTHING
    `;
    await tx`
      INSERT INTO user_settings(subject_id)
      VALUES(${subject})
      ON CONFLICT(subject_id) DO NOTHING
    `;
    await tx`
      INSERT INTO linked_accounts(subject_id,provider,provider_subject,wallet_address)
      VALUES(${subject},${network === 'SOLANA' ? 'WALLET_SOLANA' : 'WALLET_SUI'},${wallet},${wallet})
      ON CONFLICT(provider,provider_subject) DO UPDATE SET wallet_address=EXCLUDED.wallet_address,verified_at=now()
    `;
  });

  await setSessionCookie({ sub: subject, wallet, network, kind: 'EXTERNAL' });
  await recordPlatformEvent({type:'WALLET_LINKED',subjectId:subject,source:'WALLET_AUTH',payload:{wallet,network}});
  return ok({ authenticated: true, subject, wallet, network, identityProvider:identity?.provider ?? 'WALLET_ONLY' });
});
