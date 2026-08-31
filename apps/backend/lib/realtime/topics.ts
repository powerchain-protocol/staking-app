import type { RealtimeTopic } from '@powerchain/contracts';
import { REALTIME_TOPICS } from '@powerchain/contracts';
import { ApiError } from '@/lib/server/http';

const allowed = new Set<string>(REALTIME_TOPICS);
export function parseRealtimeTopics(input: unknown): RealtimeTopic[] {
  const values = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : [];
  const topics = [...new Set(values.map((x)=>String(x).trim()).filter((x)=>allowed.has(x)))] as RealtimeTopic[];
  return topics;
}
export function requireRealtimeTopics(input: unknown, max: number): RealtimeTopic[] {
  const topics = parseRealtimeTopics(input);
  if (!topics.length) throw new ApiError(400,'REALTIME_TOPICS_REQUIRED','At least one supported realtime topic is required');
  if (topics.length > max) throw new ApiError(400,'REALTIME_SUBSCRIPTION_LIMIT',`At most ${max} realtime topics may be subscribed`);
  return topics;
}
