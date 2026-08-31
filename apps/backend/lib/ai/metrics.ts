import 'server-only';
import { db } from '@/lib/server/db';
import { providerHealth } from './provider-health';
import { latestEvalSummary } from './evals';

export async function aiOperationalOverview() {
  const sql = db();
  const [requests] = await sql()`SELECT count(*)::int AS total,count(*) FILTER(WHERE status='FAILED')::int AS failed,COALESCE(avg(latency_ms),0)::numeric(12,2) AS avg_latency_ms,COALESCE(percentile_cont(0.95) WITHIN GROUP(ORDER BY latency_ms) FILTER(WHERE latency_ms IS NOT NULL),0)::numeric(12,2) AS p95_latency_ms,COALESCE(sum(fallback_count),0)::int AS fallbacks,COALESCE(avg(evidence_score),0)::numeric(6,5) AS avg_evidence_score FROM ai_requests WHERE created_at>now()-interval '15 minutes'`;
  const [grounding] = await sql()`SELECT count(*)::int AS total,count(*) FILTER(WHERE abstained)::int AS abstained,COALESCE(avg((report->>'citationCoverage')::numeric),0)::numeric(6,5) AS avg_citation_coverage FROM ai_grounding_reports WHERE created_at>now()-interval '15 minutes'`;
  const [feedback] = await sql()`SELECT count(*)::int AS total,count(*) FILTER(WHERE rating=1)::int AS positive,count(*) FILTER(WHERE rating=-1)::int AS negative FROM ai_feedback WHERE created_at>now()-interval '24 hours'`;
  return { window: '15m', requests, grounding, feedback24h: feedback, providers: await providerHealth(), evals: await latestEvalSummary() };
}
