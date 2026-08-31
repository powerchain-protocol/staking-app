import 'server-only';
import { db } from './db';
import { env } from './config';
import { ApiError } from './http';
import { sha256, timingSafeEqualString } from './crypto';

export function verifyHeliusWebhookAuthorization(request: Request) {
  if (!env.heliusWebhookAuthToken) throw new ApiError(503, 'WEBHOOK_NOT_CONFIGURED', 'HELIUS_WEBHOOK_AUTH_TOKEN is not configured');
  const received = request.headers.get('authorization') ?? '';
  if (!timingSafeEqualString(received, env.heliusWebhookAuthToken)) throw new ApiError(401, 'WEBHOOK_UNAUTHORIZED', 'Invalid Helius webhook authorization');
}

export async function ingestHeliusEvents(payload: unknown) {
  if (!Array.isArray(payload)) throw new ApiError(400, 'INVALID_WEBHOOK_PAYLOAD', 'Helius webhook payload must be an array');
  const sql = db();
  let accepted = 0;
  for (const raw of payload.slice(0, 500) as Array<Record<string, unknown>>) {
    const signature = typeof raw.signature === 'string' ? raw.signature : null;
    const eventKey = signature ?? sha256(JSON.stringify(raw));
    const rows = await sql`
      INSERT INTO chain_webhook_events(provider,network,event_key,signature,payload,next_attempt_at)
      VALUES('HELIUS','SOLANA',${eventKey},${signature},${sql.json(raw)},now())
      ON CONFLICT(provider,network,event_key) DO NOTHING
      RETURNING id
    `;
    accepted += rows.length;
  }
  return { accepted };
}

export async function pendingWebhookSignatures(limit: number) {
  return db()`
    SELECT id,signature,processing_attempts
    FROM chain_webhook_events
    WHERE processed_at IS NULL
      AND dead_lettered_at IS NULL
      AND signature IS NOT NULL
      AND COALESCE(next_attempt_at,received_at) <= now()
    ORDER BY received_at ASC LIMIT ${limit}
  `;
}

export async function markWebhookProcessed(id: string) {
  await db()`UPDATE chain_webhook_events SET processed_at=now(),processing_error=NULL,next_attempt_at=NULL WHERE id=${id}`;
}

export async function markWebhookFailed(id: string, error: string) {
  const [row] = await db()`SELECT processing_attempts FROM chain_webhook_events WHERE id=${id} FOR UPDATE`;
  const attempts = Number(row?.processing_attempts ?? 0) + 1;
  if (attempts >= env.webhookMaxProcessingAttempts) {
    await db()`UPDATE chain_webhook_events SET processing_attempts=${attempts},processing_error=${error.slice(0,2000)},dead_lettered_at=now(),next_attempt_at=NULL WHERE id=${id}`;
    await db()`INSERT INTO operational_alerts(fingerprint,alert_type,severity,message,details) VALUES(${`webhook-dead-letter:${id}`},'WEBHOOK_DEAD_LETTER','WARNING','A chain webhook event exceeded its retry budget',${db().json({eventId:id,attempts,error:error.slice(0,512)})}) ON CONFLICT DO NOTHING`;
    return { deadLettered: true, attempts };
  }
  const backoff = Math.min(3600, env.webhookRetryBaseSeconds * (2 ** Math.max(0, attempts - 1)));
  await db()`UPDATE chain_webhook_events SET processing_attempts=${attempts},processing_error=${error.slice(0,2000)},next_attempt_at=now()+(${backoff}::text||' seconds')::interval WHERE id=${id}`;
  return { deadLettered: false, attempts, retryAfterSeconds: backoff };
}
