import { requirePlatformIdentity } from '@/lib/auth/identity';
import { runAiChat } from '@/lib/ai/orchestrator';
import { jsonBody, requireString, route } from '@/lib/server/http';
import { requestContext } from '@/lib/server/request-context';
import type { AiProviderId, ResponseStyle } from '@/lib/ai/types';

export const runtime = 'nodejs';

function frame(event: string, data: unknown) { return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; }

export const POST = route(async (request: Request) => {
  const identity = await requirePlatformIdentity(request);
  const body = await jsonBody<Record<string, unknown>>(request);
  const message = requireString(body.message, 'message', 200000);
  const input = {
    subjectId: identity.subjectId,
    message,
    model: typeof body.model === 'string' ? body.model : undefined,
    provider: typeof body.provider === 'string' ? body.provider as AiProviderId : undefined,
    assistantId: typeof body.assistantId === 'string' ? body.assistantId : 'powerchain',
    style: typeof body.style === 'string' ? body.style as ResponseStyle : 'professional',
    conversationId: typeof body.conversationId === 'string' ? body.conversationId : undefined,
    loraAdapter: typeof body.loraAdapter === 'string' ? body.loraAdapter : undefined,
    tools: Array.isArray(body.tools) ? body.tools.filter((x): x is string => typeof x === 'string').slice(0, 16) : [],
    requestId: requestContext()?.requestId ?? crypto.randomUUID(),
  };
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(frame(event, data)));
      send('accepted', { requestId: input.requestId });
      void runAiChat(input, { onStage: (stage) => send('stage', stage) })
        .then((result) => send('result', result))
        .catch((error: any) => send('error', { code: String(error?.code ?? 'AI_RUNTIME_ERROR'), message: error?.status && error.status < 500 ? String(error.message) : 'Copilot could not complete the request.' }))
        .finally(() => controller.close());
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no', connection: 'keep-alive' } });
});
