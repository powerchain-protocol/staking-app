import { requirePlatformIdentity } from '@/lib/auth/identity';
import { db } from '@/lib/server/db';
import { ApiError, ok, route } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (r: Request, { params }: { params: Promise<{ id: string }> }) => {
  const identity = await requirePlatformIdentity(r);
  const { id } = await params;
  const [conversation] = await db()`SELECT id::text,title,assistant_id,response_style FROM ai_conversations WHERE id=${id}::uuid AND subject_id=${identity.subjectId}`;
  if (!conversation) throw new ApiError(404, 'AI_CONVERSATION_NOT_FOUND', 'Conversation not found');
  const messages = await db()`SELECT id::text,role,content,provider,model,certainty,citations,tool_runs,created_at FROM ai_messages WHERE conversation_id=${id}::uuid AND subject_id=${identity.subjectId} ORDER BY created_at ASC LIMIT 500`;
  return ok({ conversation, messages });
});
