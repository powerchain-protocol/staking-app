import 'server-only';
import { db } from '@/lib/server/db';
import { env } from '@/lib/server/config';

export async function pruneAiData() {
  const [conversations, feedback] = await Promise.all([
    db()`DELETE FROM ai_conversations WHERE updated_at < now()-(${env.aiConversationRetentionDays}::text||' days')::interval RETURNING id`,
    db()`DELETE FROM ai_feedback WHERE created_at < now()-(${env.aiFeedbackRetentionDays}::text||' days')::interval RETURNING id`,
  ]);
  return { conversationsDeleted: conversations.length, feedbackDeleted: feedback.length };
}
