import 'server-only';
import { db } from '@/lib/server/db';
import { env } from '@/lib/server/config';
import { ApiError } from '@/lib/server/http';
import { availableProviders, generateWithProvider, type ProviderRequest, type ProviderResponse } from './providers';
import type { AiProviderId } from './types';

type HealthRow = { provider: string; state: string; open_until: string | Date | null; consecutive_failures: number };

function candidates(primary: AiProviderId) {
  const configured = new Set(availableProviders().map((x) => x.id));
  const ordered = [primary, ...env.aiProviderFallbacks] as AiProviderId[];
  return [...new Set(ordered)].filter((id) => env.aiAllowedProviders.includes(id) && configured.has(id));
}

async function healthMap(ids: AiProviderId[]) {
  if (!ids.length) return new Map<string, HealthRow>();
  try {
    const rows = await db()`SELECT provider,state,open_until,consecutive_failures FROM ai_provider_health WHERE provider=ANY(${ids})`;
    return new Map((rows as HealthRow[]).map((row) => [row.provider, row]));
  } catch { return new Map<string, HealthRow>(); }
}

function isOpen(row?: HealthRow) {
  if (!row || row.state !== 'OPEN' || !row.open_until) return false;
  return new Date(row.open_until).getTime() > Date.now();
}

async function recordSuccess(provider: string, latencyMs: number) {
  try { await db()`
    INSERT INTO ai_provider_health(provider,state,consecutive_failures,successes,last_latency_ms,avg_latency_ms,last_success_at,open_until,updated_at)
    VALUES(${provider},'HEALTHY',0,1,${latencyMs},${latencyMs},now(),NULL,now())
    ON CONFLICT(provider) DO UPDATE SET state='HEALTHY',consecutive_failures=0,successes=ai_provider_health.successes+1,last_latency_ms=${latencyMs},avg_latency_ms=COALESCE(ai_provider_health.avg_latency_ms*0.8+${latencyMs}*0.2,${latencyMs}),last_success_at=now(),open_until=NULL,updated_at=now()`; } catch {}
}

async function recordFailure(provider: string, code: string) {
  try { await db()`
    INSERT INTO ai_provider_health(provider,state,consecutive_failures,failures,last_error_code,last_failure_at,open_until,updated_at)
    VALUES(${provider},'DEGRADED',1,1,${code},now(),NULL,now())
    ON CONFLICT(provider) DO UPDATE SET failures=ai_provider_health.failures+1,consecutive_failures=ai_provider_health.consecutive_failures+1,last_error_code=${code},last_failure_at=now(),state=CASE WHEN ai_provider_health.consecutive_failures+1>=${env.aiProviderFailureThreshold} THEN 'OPEN' ELSE 'DEGRADED' END,open_until=CASE WHEN ai_provider_health.consecutive_failures+1>=${env.aiProviderFailureThreshold} THEN now()+(${env.aiProviderOpenSeconds}::text||' seconds')::interval ELSE ai_provider_health.open_until END,updated_at=now()`; } catch {}
}

function retryable(error: unknown) {
  return error instanceof ApiError ? error.status >= 500 : true;
}

export async function generateWithFailover(primary: AiProviderId, input: ProviderRequest): Promise<ProviderResponse & { fallbackCount: number; requestedProvider: AiProviderId }> {
  const ids = input.loraAdapter ? candidates(primary).filter((id) => id === primary) : candidates(primary);
  if (!ids.length) throw new ApiError(503, 'AI_PROVIDER_UNAVAILABLE', 'No configured AI provider is allowed by deployment policy');
  const health = await healthMap(ids);
  let lastError: unknown;
  let attempts = 0;
  for (const id of ids) {
    if (isOpen(health.get(id))) continue;
    const started = Date.now();
    try {
      const response = await generateWithProvider(id, input);
      await recordSuccess(id, Date.now() - started);
      return { ...response, requestedProvider: primary, fallbackCount: attempts };
    } catch (error: any) {
      lastError = error;
      await recordFailure(id, String(error?.code ?? 'AI_PROVIDER_ERROR'));
      attempts += 1;
      if (!retryable(error)) throw error;
    }
  }
  if (lastError) throw lastError;
  throw new ApiError(503, 'AI_PROVIDER_CIRCUIT_OPEN', 'All configured AI providers are temporarily unavailable');
}

export async function providerHealth() {
  const configured = availableProviders().filter((x) => env.aiAllowedProviders.includes(x.id));
  try {
    const rows = await db()`SELECT provider,state,consecutive_failures,successes,failures,last_latency_ms,avg_latency_ms,last_error_code,last_success_at,last_failure_at,open_until,updated_at FROM ai_provider_health ORDER BY provider`;
    const by = new Map((rows as any[]).map((r) => [r.provider, r]));
    return configured.map((p) => { const raw:any=by.get(p.id) ?? { provider: p.id, state: 'UNKNOWN', consecutive_failures: 0, successes: 0, failures: 0 }; const expired=raw.state==='OPEN'&&raw.open_until&&new Date(raw.open_until).getTime()<=Date.now(); return { ...p, health: expired ? { ...raw, state: 'DEGRADED', probeEligible: true } : raw }; });
  } catch { return configured.map((p) => ({ ...p, health: { provider: p.id, state: 'UNKNOWN' } })); }
}
