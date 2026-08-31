import 'server-only';
import { db } from './db';
import { ApiError } from './http';
import { sha256 } from './crypto';

export function requestIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

export function rateLimitKey(scope: string, identity: string) {
  return `${scope}:${sha256(identity).slice(0, 32)}`;
}

export async function enforceRateLimit(bucketKey: string, limit: number, windowSeconds: number) {
  const sql = db();
  const now = new Date();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs * 2);
  const [row] = await sql`
    INSERT INTO rate_limit_windows(bucket_key,window_start,hit_count,expires_at)
    VALUES(${bucketKey},${windowStart},1,${expiresAt})
    ON CONFLICT(bucket_key,window_start)
    DO UPDATE SET hit_count=rate_limit_windows.hit_count+1
    RETURNING hit_count
  `;
  if (Number(row.hit_count) > limit) throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.', { retryAfterSeconds: windowSeconds });
  if (Math.random() < 0.01) await sql`DELETE FROM rate_limit_windows WHERE expires_at < now()`;
}
