import 'server-only';
import { db } from '@/lib/server/db';
import { enforceAiPolicy, hashAiRequest, assertAiOutputSafe } from './security';
import { retrieveEvidence, groundingContext } from './grounding';
import { getAssistant, getSkill } from './catalog';
import { generateWithFailover } from './provider-health';
import { parseStructuredAnswer, verifyGroundedAnswer } from './verification';
import { recordPlatformEvent } from '@/lib/events';
import { hashToolInput, toolSpec } from './mcp';
import { executeAiTool } from './tools';
import { env } from '@/lib/server/config';
import { planReadTools } from './planner';
import { ApiError } from '@/lib/server/http';
import { buildSystemPrompt, promptFingerprint, PROMPT_POLICY } from './prompts';
import type { AiChatInput, AiAssistantResponse, ResponseStyle, AiProviderId, AiToolResult, AiStageEvent } from './types';

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'citationIds', 'unsupportedClaims'],
  properties: {
    answer: { type: 'string' },
    citationIds: { type: 'array', items: { type: 'string' } },
    unsupportedClaims: { type: 'array', items: { type: 'string' } },
  },
};

type Hooks = { onStage?: (event: AiStageEvent) => void | Promise<void> };

function boundedHistory(rows: Array<{ role: string; content: string }>) {
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let bytes = 0;
  for (const row of [...rows].reverse()) {
    const role = row.role === 'USER' ? 'user' : row.role === 'ASSISTANT' ? 'assistant' : null;
    if (!role) continue;
    const content = String(row.content ?? '');
    const size = Buffer.byteLength(content, 'utf8');
    if (bytes + size > env.aiMaxHistoryBytes) break;
    out.push({ role, content }); bytes += size;
  }
  return out.reverse();
}

function normalizeStyle(value?: string): ResponseStyle {
  return (['professional', 'concise', 'operator', 'analyst', 'technical', 'executive'] as const).includes(value as any)
    ? value as ResponseStyle : 'professional';
}

function toolContext(results: AiToolResult[]) {
  if (!results.length) return 'NO TOOL RESULTS.';
  return results.map((x) => x.ok
    ? `[${x.citation?.id ?? x.name}] TOOL ${x.name} (${x.mode}) VERIFIED RESULT\n${JSON.stringify(x.content).slice(0, 12000)}`
    : `TOOL ${x.name} (${x.mode}) UNAVAILABLE\n${JSON.stringify(x.content).slice(0, 1200)}`).join('\n\n');
}

async function emit(hooks: Hooks | undefined, event: AiStageEvent) { await hooks?.onStage?.(event); }

async function runTools(subjectId: string, names: string[], requestId: string, aiRequestId: string, userMessage: string, domains: string[]) {
  const out: AiToolResult[] = [];
  for (const name of names.slice(0, env.aiMaxToolCalls)) {
    const spec = toolSpec(name); if (!spec) continue;
    if (spec.mode === 'STATE_CHANGE') throw new ApiError(403, 'AI_STATE_CHANGE_BLOCKED', 'AI cannot execute a state-changing tool');
    const args = name === 'rag.search' ? { query: userMessage, domains } : {};
    const sql = db();
    const [run] = await sql()`INSERT INTO ai_tool_runs(request_id,subject_id,tool_name,tool_mode,input_hash,status) VALUES(${aiRequestId}::uuid,${subjectId},${name},${spec.mode},${hashToolInput(args)},'STARTED') RETURNING id::text`;
    try {
      const result = await executeAiTool(subjectId, { name, arguments: args }, requestId);
      out.push(result);
      await sql()`UPDATE ai_tool_runs SET status='COMPLETED',output_summary=${sql.json({ ok: true, citationId: result.citation?.id ?? null })},completed_at=now() WHERE id=${run.id}::uuid`;
    } catch (error: any) {
      const errorCode = typeof error?.code === 'string' ? error.code : 'AI_TOOL_FAILED';
      await sql()`UPDATE ai_tool_runs SET status='FAILED',error_code=${errorCode},output_summary=${sql.json({ ok: false, errorCode })},completed_at=now() WHERE id=${run.id}::uuid`;
      out.push({ name, mode: spec.mode, ok: false, content: { status: 'UNAVAILABLE', errorCode } });
    }
  }
  return out;
}

export async function runAiChat(input: AiChatInput, hooks?: Hooks): Promise<{ requestId: string; conversationId: string; response: AiAssistantResponse }> {
  const started = Date.now();
  const assistant = getAssistant(input.assistantId ?? 'powerchain');
  const style = normalizeStyle(input.style);
  const model = input.model || env.aiDefaultModel;
  const requestedProvider = (input.provider ?? env.aiDefaultProvider) as AiProviderId;
  if (!env.aiAllowedProviders.includes(requestedProvider)) throw new ApiError(403, 'AI_PROVIDER_NOT_ALLOWED', 'Requested AI provider is outside the deployment allowlist');
  const requestedTools = planReadTools(input.message, (input.tools ?? []).filter(Boolean), env.aiAllowedTools).slice(0, env.aiMaxToolCalls);
  if (input.loraAdapter && (!env.aiLoraAdapters.includes(input.loraAdapter) || requestedProvider !== 'local')) throw new ApiError(400, 'AI_LORA_NOT_ALLOWED', 'LoRA adapter is not allowlisted for the local provider');

  await emit(hooks, { stage: 'policy', message: 'Applying AI security and authority policy.' });
  const policy = await enforceAiPolicy(input.subjectId, { model, message: input.message, tools: requestedTools });

  await emit(hooks, { stage: 'grounding', message: 'Retrieving trusted evidence.' });
  const evidence = await retrieveEvidence(input.message, assistant.domains, env.aiRagMaxResults);
  const citations = evidence.map((x) => x.citation);
  const evidenceScore = evidence.length ? evidence.reduce((sum, item) => sum + item.score, 0) / evidence.length : 0;
  const evidenceRequired = assistant.skills.some((x) => getSkill(x)?.evidenceRequired);

  const sql = db();
  let conversationId = input.conversationId;
  if (conversationId) {
    const rows = await sql()`SELECT id FROM ai_conversations WHERE id=${conversationId}::uuid AND subject_id=${input.subjectId}`;
    if (!rows.length) conversationId = undefined;
  }
  if (!conversationId) {
    const [row] = await sql()`INSERT INTO ai_conversations(subject_id,assistant_id,response_style,title) VALUES(${input.subjectId},${assistant.id},${style},${input.message.slice(0,100)}) RETURNING id::text`;
    conversationId = row.id;
  }
  const previousRows = await sql()`SELECT role,content FROM ai_messages WHERE conversation_id=${conversationId}::uuid AND subject_id=${input.subjectId} AND role IN ('USER','ASSISTANT') ORDER BY created_at DESC LIMIT 24`;
  const history = boundedHistory(previousRows as Array<{ role: string; content: string }>);
  await sql()`INSERT INTO ai_messages(conversation_id,subject_id,role,content) VALUES(${conversationId}::uuid,${input.subjectId},'USER',${input.message})`;

  const [rq] = await sql()`INSERT INTO ai_requests(subject_id,model,request_hash,prompt_bytes,status,policy_version,requested_provider,prompt_version,evidence_score) VALUES(${input.subjectId},${model},${hashAiRequest({message:input.message,assistant:assistant.id,style,provider:requestedProvider,tools:requestedTools,loraAdapter:input.loraAdapter??null})},${policy.bytes},'ACCEPTED','ai-runtime-v3',${requestedProvider},${env.aiPromptVersion},${evidenceScore}) RETURNING id::text`;

  try {
    await emit(hooks, { stage: 'tools', message: requestedTools.length ? 'Running approved read-only tools.' : 'No live tools are required.', meta: { toolCount: requestedTools.length } });
    const toolRuns = requestedTools.length ? await runTools(input.subjectId, requestedTools, input.requestId, rq.id, input.message, assistant.domains) : [];
    const toolCitations = toolRuns.flatMap((x) => x.citation ? [x.citation] : []);
    const availableCitations = [...citations, ...toolCitations];
    const prompt = buildSystemPrompt({ assistantName: assistant.name, style, evidence: groundingContext(evidence), tools: toolContext(toolRuns) });
    const promptHash = promptFingerprint(prompt);
    const [existingPrompt] = await sql()`SELECT sha256 FROM ai_prompt_versions WHERE prompt_key=${PROMPT_POLICY.key} AND version=${env.aiPromptVersion} LIMIT 1`;
    if (existingPrompt && existingPrompt.sha256 !== promptHash) throw new ApiError(503, 'AI_PROMPT_VERSION_CONFLICT', 'Configured AI prompt version is already registered with a different fingerprint');
    if (!existingPrompt) await sql()`INSERT INTO ai_prompt_versions(prompt_key,version,sha256,policy,active) VALUES(${PROMPT_POLICY.key},${env.aiPromptVersion},${promptHash},${sql.json(PROMPT_POLICY)},true)`;

    await emit(hooks, { stage: 'provider', message: 'Generating with provider health checks and failover.' });
    const generated = await generateWithFailover(requestedProvider, { model, system: prompt, message: input.message, history, requestId: input.requestId, responseSchema: OUTPUT_SCHEMA, loraAdapter: input.loraAdapter });
    const parsed = parseStructuredAnswer(assertAiOutputSafe(generated.text));

    await emit(hooks, { stage: 'verification', message: 'Verifying citations and removing unsupported operational claims.' });
    const checked = verifyGroundedAnswer({ answer: String(parsed.answer ?? ''), requestedCitationIds: Array.isArray(parsed.citationIds) ? parsed.citationIds.filter((x: any) => typeof x === 'string') : [], available: availableCitations, evidenceRequired });
    const response: AiAssistantResponse = {
      answer: checked.answer,
      certainty: checked.certainty,
      citations: checked.citations,
      unsupportedClaims: [...checked.unsupportedClaims, ...(Array.isArray(parsed.unsupportedClaims) ? parsed.unsupportedClaims : [])].slice(0,16),
      toolRuns,
      model: generated.model,
      provider: generated.provider,
      style,
      assistantId: assistant.id,
      promptVersion: env.aiPromptVersion,
      fallbackCount: generated.fallbackCount,
      evidenceScore: Number(evidenceScore.toFixed(4)),
    };
    const [assistantMessage] = await sql()`INSERT INTO ai_messages(conversation_id,subject_id,role,content,provider,model,certainty,citations,tool_runs) VALUES(${conversationId}::uuid,${input.subjectId},'ASSISTANT',${response.answer},${response.provider},${response.model},${response.certainty},${sql.json(response.citations)},${sql.json(toolRuns)}) RETURNING id::text`;
    response.messageId = assistantMessage.id;
    await sql()`INSERT INTO ai_grounding_reports(request_id,subject_id,evidence_count,required_citations,supported_claims,unsupported_claims,abstained,report) VALUES(${rq.id}::uuid,${input.subjectId},${evidence.length},${evidenceRequired?1:0},${checked.supportedFactualClaims},${response.unsupportedClaims.length},${checked.abstained},${sql.json({assistantId:assistant.id,certainty:response.certainty,provider:response.provider,evidenceScore,citationCoverage:checked.citationCoverage,unusedRequestedCitationIds:checked.unusedRequestedCitationIds,promptVersion:env.aiPromptVersion,fallbackCount:generated.fallbackCount})})`;
    await sql()`UPDATE ai_requests SET status='COMPLETED',provider_request_id=${generated.id??null},resolved_provider=${generated.provider},fallback_count=${generated.fallbackCount},latency_ms=${Date.now()-started},completed_at=now() WHERE id=${rq.id}::uuid`;
    await recordPlatformEvent({ type: 'AI_COMPLETED', subjectId: input.subjectId, source: 'AI_RUNTIME', payload: { requestId: rq.id, assistantId: assistant.id, requestedProvider, provider: response.provider, fallbackCount: generated.fallbackCount, certainty: response.certainty, evidenceScore } });
    await emit(hooks, { stage: 'complete', message: 'Answer verified and ready.', meta: { certainty: response.certainty, provider: response.provider } });
    return { requestId: rq.id, conversationId: conversationId!, response };
  } catch (error: any) {
    await sql()`UPDATE ai_requests SET status='FAILED',error_code=${error?.code??'AI_RUNTIME_ERROR'},latency_ms=${Date.now()-started},completed_at=now() WHERE id=${rq.id}::uuid`;
    throw error;
  }
}
