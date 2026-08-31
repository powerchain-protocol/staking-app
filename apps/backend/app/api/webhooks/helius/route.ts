import { jsonBody, ok, route } from '@/lib/server/http';
import { ingestHeliusEvents, verifyHeliusWebhookAuthorization } from '@/lib/server/webhooks';

export const runtime = 'nodejs';
export const POST = route(async (request: Request) => {
  verifyHeliusWebhookAuthorization(request);
  const payload = await jsonBody<unknown>(request);
  return ok(await ingestHeliusEvents(payload));
});
