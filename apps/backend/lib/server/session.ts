import 'server-only';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { env, assertProductionSecurity, ConfigurationError } from './config';
import { hmac, timingSafeEqualString } from './crypto';
import { ApiError } from './http';
import { db } from './db';
import { annotateRequestContext } from './request-context';
import { requirePlatformIdentity } from '@/lib/auth/identity';

const COOKIE = 'pc_staking_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type Session = {
  sid: string;
  sub: string;
  wallet: string;
  network: 'SOLANA' | 'SUI';
  kind: 'EXTERNAL' | 'EMBEDDED';
  iat: number;
  exp: number;
};

function secret() {
  assertProductionSecurity();
  if (!env.sessionSecret) throw new ConfigurationError('SESSION_SECRET is required');
  return env.sessionSecret;
}

export function encodeSession(session: Session) {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${hmac(payload, secret())}`;
}

export function decodeSession(token: string): Session | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  if (!timingSafeEqualString(signature, hmac(payload, secret()))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
    if (!session.sid || !session.sub || !session.wallet || session.exp < Math.floor(Date.now() / 1000)) return null;
    if (!['SOLANA', 'SUI'].includes(session.network) || !['EXTERNAL', 'EMBEDDED'].includes(session.kind)) return null;
    return session;
  } catch {
    return null;
  }
}

async function activeSession(decoded: Session): Promise<Session | null> {
  const sql = db();
  const [row] = await sql<{
    id: string; subject_id: string; wallet_address: string; network: string; wallet_kind: string;
  }[]>`
    SELECT id, subject_id, wallet_address, network, wallet_kind
    FROM auth_sessions
    WHERE id=${decoded.sid}::uuid
      AND revoked_at IS NULL
      AND expires_at > now()
    LIMIT 1
  `;
  if (!row) return null;
  if (
    row.subject_id !== decoded.sub ||
    row.wallet_address !== decoded.wallet ||
    row.network !== decoded.network ||
    row.wallet_kind !== decoded.kind
  ) return null;
  return decoded;
}

export async function setSessionCookie(session: Omit<Session, 'sid' | 'iat' | 'exp'>) {
  const now = Math.floor(Date.now() / 1000);
  const sid = randomUUID();
  const expires = now + SESSION_TTL_SECONDS;
  const issued = new Date(now * 1000);
  const expiresAt = new Date(expires * 1000);
  const sql = db();

  await sql`
    INSERT INTO auth_sessions(id,subject_id,wallet_address,network,wallet_kind,issued_at,expires_at)
    VALUES(${sid}::uuid,${session.sub},${session.wallet},${session.network},${session.kind},${issued},${expiresAt})
  `;

  const token = encodeSession({ ...session, sid, iat: now, exp: expires });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  const decoded = token ? decodeSession(token) : null;
  if (decoded) {
    const sql = db();
    await sql`
      UPDATE auth_sessions
      SET revoked_at=COALESCE(revoked_at, now()), revocation_reason=COALESCE(revocation_reason, 'USER_LOGOUT')
      WHERE id=${decoded.sid}::uuid
    `;
  }
  jar.set(COOKIE, '', {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  const decoded = token ? decodeSession(token) : null;
  if (!decoded) return null;
  return activeSession(decoded);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new ApiError(401, 'WALLET_AUTH_REQUIRED', 'Wallet verification is required');
  if (env.requirePrimaryIdentity) {
    const identity = await requirePlatformIdentity();
    if (identity.subjectId !== session.sub) throw new ApiError(401, 'IDENTITY_WALLET_SESSION_MISMATCH', 'Signed-in account and verified wallet session do not match');
  }
  annotateRequestContext({ subjectId: session.sub, walletAddress: session.wallet });
  return session;
}
