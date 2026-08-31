import 'server-only';
import { env } from '@/lib/server/config';
import { ApiError } from '@/lib/server/http';

export function allowedOrigin(origin: string | null) {
  if (!origin) return null;
  const allowed = new Set([env.appOrigin, ...env.apiCorsOrigins].filter(Boolean).map((x) => new URL(x).origin));
  const normalized = new URL(origin).origin;
  if (!allowed.has(normalized)) throw new ApiError(403, 'CORS_ORIGIN_DENIED', 'Origin is not allowed');
  return normalized;
}

export function corsHeaders(request: Request) {
  const origin = allowedOrigin(request.headers.get('origin'));
  return {
    ...(origin ? { 'access-control-allow-origin': origin, 'vary': 'Origin' } : {}),
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-request-id,x-idempotency-key,x-api-key',
    'access-control-max-age': '600',
  };
}
