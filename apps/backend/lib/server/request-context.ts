import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  requestId: string;
  traceId: string;
  startedAt: number;
  method?: string;
  path?: string;
  subjectId?: string | null;
  walletAddress?: string | null;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function withRequestContext<T>(context: RequestContext, fn: () => Promise<T>) {
  return storage.run(context, fn);
}

export function requestContext() {
  return storage.getStore() ?? null;
}

export function annotateRequestContext(values: Partial<Pick<RequestContext, 'subjectId' | 'walletAddress'>>) {
  const context = storage.getStore();
  if (!context) return;
  if (values.subjectId !== undefined) context.subjectId = values.subjectId;
  if (values.walletAddress !== undefined) context.walletAddress = values.walletAddress;
}

export function structuredLog(level: 'INFO' | 'WARNING' | 'ERROR', event: string, details: Record<string, unknown> = {}) {
  const context = storage.getStore();
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    requestId: context?.requestId ?? null,
    traceId: context?.traceId ?? null,
    method: context?.method ?? null,
    path: context?.path ?? null,
    subjectId: context?.subjectId ?? null,
    walletAddress: context?.walletAddress ?? null,
    ...details,
  };
  const line = JSON.stringify(payload);
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARNING') console.warn(line);
  else console.info(line);
}
