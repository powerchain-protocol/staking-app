import type { ApiErrorEnvelope } from '@powerchain/contracts';

export class PowerChainApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
    public details?: unknown,
  ) { super(message); this.name = 'PowerChainApiError'; }
}

export type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
  retryBaseMs?: number;
};

function retryable(method: string, status?: number) {
  if (!['GET','HEAD','OPTIONS'].includes(method)) return false;
  return status == null || status === 408 || status === 429 || status >= 500;
}

function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export async function apiJson<T>(input: RequestInfo | URL, options: ApiRequestOptions = {}): Promise<T> {
  const { timeoutMs = 15_000, retries = 1, retryBaseMs = 250, ...init } = options;
  const method = String(init.method ?? 'GET').toUpperCase();
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const upstream = init.signal;
    const onAbort = () => controller.abort(upstream?.reason);
    upstream?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);
    try {
      const response = await fetch(input, { cache: 'no-store', credentials: 'same-origin', ...init, signal: controller.signal });
      const body = await response.json().catch(() => ({})) as T & ApiErrorEnvelope;
      if (response.ok) return body;
      const error = new PowerChainApiError(
        response.status,
        body.error?.code ?? 'REQUEST_FAILED',
        body.error?.message ?? `Request failed (${response.status})`,
        body.error?.requestId,
        body.error?.details,
      );
      if (attempt < retries && retryable(method, response.status)) {
        const retryAfter = Number(response.headers.get('retry-after') ?? '0');
        await wait(retryAfter > 0 ? retryAfter * 1000 : retryBaseMs * (2 ** attempt));
        continue;
      }
      throw error;
    } catch (error) {
      lastError = error;
      if (attempt < retries && retryable(method) && !(error instanceof PowerChainApiError)) {
        await wait(retryBaseMs * (2 ** attempt));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      upstream?.removeEventListener('abort', onAbort);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed');
}

export function idempotencyHeaders(prefix = 'action') {
  return { 'idempotency-key': `${prefix}:${crypto.randomUUID()}` };
}

export async function apiPost<T>(path: string, body: unknown, prefix = 'action', init: ApiRequestOptions = {}) {
  return apiJson<T>(path, {
    ...init,
    method: 'POST',
    retries: 0,
    headers: { 'content-type': 'application/json', ...idempotencyHeaders(prefix), ...(init.headers ?? {}) },
    body: JSON.stringify(body),
  });
}
