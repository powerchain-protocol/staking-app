import 'server-only';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from './db';
import { requestContext, structuredLog, withRequestContext } from './request-context';

const MAX_JSON_BYTES = 1_048_576;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,64}$/;
const TRACEPARENT = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

function parseTraceId(request: Request | null) {
  const traceparent = request?.headers.get('traceparent')?.trim() ?? '';
  const matched = TRACEPARENT.exec(traceparent);
  return matched?.[1]?.toLowerCase() ?? crypto.randomBytes(16).toString('hex');
}

function parseRequestId(request: Request | null) {
  const supplied = request?.headers.get('x-request-id')?.trim() ?? '';
  return SAFE_REQUEST_ID.test(supplied) ? supplied : crypto.randomUUID();
}

function rejectDangerousKeys(value: unknown, depth = 0) {
  if (depth > 40) throw new ApiError(400, 'JSON_TOO_DEEP', 'JSON body exceeds the maximum nesting depth');
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) rejectDangerousKeys(item, depth + 1);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      throw new ApiError(400, 'UNSAFE_JSON_KEY', `JSON field ${key} is not allowed`);
    }
    rejectDangerousKeys(child, depth + 1);
  }
}

export async function jsonBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  const contentType = request.headers.get('content-type');
  if (contentType && !/^(application\/json\b|application\/[^;]+\+json\b)/i.test(contentType)) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Request body must use application/json');
  }
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_JSON_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the 1 MiB limit');

  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'INVALID_JSON', 'Request body must contain valid JSON');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_JSON_BYTES) {
        await reader.cancel('payload too large');
        throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the 1 MiB limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(bytes);
  if (!text.trim()) throw new ApiError(400, 'INVALID_JSON', 'Request body must contain valid JSON');
  try {
    const parsed = JSON.parse(text) as T;
    rejectDangerousKeys(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }
}

export function requireString(value: unknown, field: string, max = 1024) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) throw new ApiError(400, 'INVALID_ARGUMENT', `${field} must be a non-empty string`);
  return value.trim();
}

export function optionalString(value: unknown, max = 1024) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw new ApiError(400, 'INVALID_ARGUMENT', 'Invalid string value');
  return value.trim();
}

export function atomicString(value: unknown, field: string) {
  const stringValue = typeof value === 'bigint' ? value.toString() : typeof value === 'number' ? String(value) : value;
  if (typeof stringValue !== 'string' || !/^\d+$/.test(stringValue)) throw new ApiError(400, 'INVALID_ARGUMENT', `${field} must be an unsigned integer string`);
  const n = BigInt(stringValue);
  if (n <= 0n) throw new ApiError(400, 'INVALID_ARGUMENT', `${field} must be greater than zero`);
  return n;
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { 'cache-control': 'no-store', ...(init?.headers ?? {}) } });
}

export function apiError(error: unknown, requestId = crypto.randomUUID()) {
  const headers: Record<string, string> = { 'cache-control': 'no-store', 'x-request-id': requestId };
  if (error instanceof ApiError) {
    if (error.status === 429 && error.details && typeof error.details === 'object' && 'retryAfterSeconds' in error.details) {
      headers['retry-after'] = String((error.details as Record<string, unknown>).retryAfterSeconds ?? '60');
    }
    return NextResponse.json({ error: { code: error.code, message: error.message, details: error.details ?? null, requestId } }, { status: error.status, headers });
  }
  const e = error as { code?: string; message?: string; details?: unknown };
  const code = e?.code ?? 'INTERNAL_ERROR';
  const status = code === 'CONFIGURATION_ERROR' ? 503 : code === 'PREPARED_TRANSACTION_EXPIRED' ? 409 : 500;
  return NextResponse.json({ error: { code, message: status === 500 ? 'Internal server error' : e?.message ?? 'Service is not configured', details: status === 500 ? null : e?.details ?? null, requestId } }, { status, headers });
}

function enforceBrowserOrigin(request: Request) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) return;
  const origin = request.headers.get('origin');
  if (!origin) return;
  let expected: string;
  try { expected = new URL(process.env.APP_ORIGIN ?? 'http://localhost:3001').origin; }
  catch { throw new ApiError(503, 'CONFIGURATION_ERROR', 'APP_ORIGIN is invalid'); }
  if (origin !== expected) throw new ApiError(403, 'ORIGIN_MISMATCH', 'Request origin is not allowed');
}

async function auditMutation(request: Request | null, requestId: string, status: number, durationMs: number, errorCode?: string | null) {
  if (!request || !['POST','PUT','PATCH','DELETE'].includes(request.method.toUpperCase())) return;
  try {
    const context = requestContext();
    const path = new URL(request.url).pathname;
    await db()`INSERT INTO mutation_audit_events(request_id,method,path,subject_id,wallet_address,status_code,duration_ms,error_code) VALUES(${requestId},${request.method.toUpperCase()},${path},${context?.subjectId ?? null},${context?.walletAddress ?? null},${status},${durationMs},${errorCode ?? null})`;
  } catch { /* Auditing must never mask the primary API result; readiness verifies migrations. */ }
}

export function route<T extends (...args: any[]) => Promise<Response>>(handler: T): T {
  return (async (...args: Parameters<T>) => {
    const request = args[0] instanceof Request ? args[0] : null;
    const requestId = parseRequestId(request);
    const traceId = parseTraceId(request);
    const started = Date.now();
    const path = request ? new URL(request.url).pathname : undefined;

    return withRequestContext({ requestId, traceId, startedAt: started, method: request?.method, path }, async () => {
      try {
        if (request) enforceBrowserOrigin(request);
        const response = await handler(...args);
        const durationMs = Date.now() - started;
        response.headers.set('x-request-id', requestId);
        response.headers.set('x-trace-id', traceId);
        response.headers.set('server-timing', `app;dur=${durationMs}`);
        response.headers.set('cache-control', response.headers.get('cache-control') ?? 'no-store');
        await auditMutation(request, requestId, response.status, durationMs, null);
        structuredLog('INFO', 'api_request_completed', { statusCode: response.status, durationMs });
        return response;
      } catch (error) {
        const durationMs = Date.now() - started;
        const response = apiError(error, requestId);
        response.headers.set('x-trace-id', traceId);
        response.headers.set('server-timing', `app;dur=${durationMs}`);
        const code = error instanceof ApiError ? error.code : (error as any)?.code ?? 'INTERNAL_ERROR';
        await auditMutation(request, requestId, response.status, durationMs, String(code));
        structuredLog(response.status >= 500 ? 'ERROR' : 'WARNING', 'api_request_failed', { statusCode: response.status, durationMs, errorCode: String(code) });
        return response;
      }
    });
  }) as T;
}
