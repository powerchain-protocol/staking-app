import 'server-only';
import { db } from '@/lib/server/db';
import { env } from '@/lib/server/config';
import { planReadTools } from './planner';
import { enforceAiPolicy } from './security';

function forbiddenHit(input: string, patterns: unknown) {
  if (!Array.isArray(patterns)) return false;
  return patterns.some((p) => typeof p === 'string' && p && input.toLowerCase().includes(p.toLowerCase()));
}

export async function runPolicyEvals() {
  const cases = await db()`SELECT id::text,case_key,domain,input,expected_tools,required_evidence,forbidden_patterns,expected_behavior FROM ai_eval_cases WHERE enabled=true ORDER BY case_key`;
  let passed = 0;
  const results: any[] = [];
  for (const row of cases as any[]) {
    let ok = true; let errorCode: string | null = null; let score = 1;
    const planned = planReadTools(row.input, [], env.aiAllowedTools);
    const expected = Array.isArray(row.expected_tools) ? row.expected_tools.filter((x: unknown) => typeof x === 'string') : [];
    if (expected.some((tool: string) => !planned.includes(tool))) { ok = false; score -= 0.4; }
    if (forbiddenHit(row.input, row.forbidden_patterns) && row.expected_behavior !== 'REJECT_INPUT') { ok = false; score -= 0.3; }
    try { await enforceAiPolicy(`eval:${row.case_key}`, { model: env.aiDefaultModel, message: row.input, tools: planned }); if (row.expected_behavior === 'REJECT_INPUT') { ok = false; score = 0; errorCode = 'EXPECTED_REJECTION_NOT_OBSERVED'; } }
    catch (error: any) { errorCode = String(error?.code ?? 'EVAL_ERROR'); if (row.expected_behavior !== 'REJECT_INPUT') { ok = false; score = 0; } }
    score = Math.max(0, Math.min(1, score));
    await db()`INSERT INTO ai_eval_runs(case_id,provider,model,prompt_version,passed,score,metrics,error_code) VALUES(${row.id}::uuid,${env.aiDefaultProvider},${env.aiDefaultModel},${env.aiPromptVersion},${ok},${score},${db().json({plannedTools:planned,expectedTools:expected})},${errorCode})`;
    if (ok) passed += 1;
    results.push({ caseKey: row.case_key, passed: ok, score, errorCode, plannedTools: planned });
  }
  const total = results.length;
  const passRate = total ? passed / total : 1;
  return { total, passed, passRate, minimumPassRate: env.aiEvalMinPassRate, healthy: passRate >= env.aiEvalMinPassRate, results };
}

export async function latestEvalSummary() {
  const [row] = await db()`SELECT count(*)::int AS total,count(*) FILTER (WHERE passed)::int AS passed,max(created_at) AS last_run_at FROM ai_eval_runs WHERE created_at > now()-interval '24 hours'`;
  const total = Number(row?.total ?? 0); const passed = Number(row?.passed ?? 0); const passRate = total ? passed / total : null;
  return { total, passed, passRate, minimumPassRate: env.aiEvalMinPassRate, healthy: passRate == null ? null : passRate >= env.aiEvalMinPassRate, lastRunAt: row?.last_run_at ?? null };
}
