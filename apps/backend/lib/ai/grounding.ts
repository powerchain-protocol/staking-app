import 'server-only';
import {createHash}from'node:crypto';
import{db}from'@/lib/server/db';
import{env}from'@/lib/server/config';
import type{AiEvidence,AiCitation}from'./types';

export function sourceHash(value:string){return createHash('sha256').update(value).digest('hex')}

function terms(value:string){return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g)??[])}
function lexicalOverlap(query:string,content:string){const q=terms(query);if(!q.size)return 0;const c=terms(content);let hit=0;for(const t of q)if(c.has(t))hit++;return hit/q.size}
function trustWeight(tier:string){return tier==='AUTHORITATIVE'?1:tier==='VERIFIED'?.9:tier==='REFERENCE'?.72:.25}
const INSTRUCTION_LIKE=/\b(ignore (?:all|any|the) (?:previous|prior) instructions?|system prompt|developer message|you are chatgpt|follow these instructions?|reveal (?:the )?(?:system|developer) prompt|override (?:policy|instructions?))\b/i;
function sanitizeEvidence(value:string){return value.split(/\r?\n/).map((line)=>INSTRUCTION_LIKE.test(line)?'[instruction-like source line removed]':line).join('\n').slice(0,24000)}
function normalizeRank(rank:number){return 1-Math.exp(-Math.max(0,rank)*4)}

export async function retrieveEvidence(query:string,domains:string[],limit=8):Promise<AiEvidence[]>{
 const q=query.trim();if(!q)return[];const sql=db();const candidateLimit=Math.max(limit,Math.min(env.aiRagCandidateLimit,64));
 const rows=await sql()`SELECT c.id::text AS chunk_id,c.document_id::text AS document_id,c.content,d.title,d.source_type,d.source_uri,d.trust_tier,d.domain,d.quality_score,
 ts_rank_cd(c.search_vector,websearch_to_tsquery('english',${q})) AS rank_score
 FROM ai_rag_chunks c JOIN ai_rag_documents d ON d.id=c.document_id
 WHERE d.enabled=true AND d.trust_tier IN ('AUTHORITATIVE','VERIFIED','REFERENCE') AND (d.valid_from IS NULL OR d.valid_from<=now()) AND (d.valid_until IS NULL OR d.valid_until>now())
 AND (${domains.length===0} OR d.domain=ANY(${domains})) AND c.search_vector @@ websearch_to_tsquery('english',${q})
 ORDER BY CASE d.trust_tier WHEN 'AUTHORITATIVE' THEN 4 WHEN 'VERIFIED' THEN 3 WHEN 'REFERENCE' THEN 2 ELSE 1 END DESC,rank_score DESC LIMIT ${candidateLimit}`;
 const scored=(rows as any[]).map((r)=>{const sanitized=sanitizeEvidence(String(r.content??''));const quality=Math.max(0,Math.min(1,Number(r.quality_score??1)));const rank=normalizeRank(Number(r.rank_score??0));const overlap=lexicalOverlap(q,sanitized);const score=(trustWeight(String(r.trust_tier))*0.42)+(quality*0.23)+(rank*0.20)+(overlap*0.15);return{...r,content:sanitized,score};}).filter((r)=>r.score>=env.aiRagMinEvidenceScore).sort((a,b)=>b.score-a.score);
 const perDocument=new Map<string,number>();const seenContent=new Set<string>();const selected:any[]=[];
 for(const r of scored){const contentHash=sourceHash(String(r.content).trim().toLowerCase());if(seenContent.has(contentHash))continue;const count=perDocument.get(r.document_id)??0;if(count>=2)continue;selected.push(r);seenContent.add(contentHash);perDocument.set(r.document_id,count+1);if(selected.length>=Math.max(1,Math.min(limit,16)))break;}
 return selected.map((r:any)=>{const citation:AiCitation={id:`src_${r.chunk_id}`,title:r.title,sourceType:r.source_type,sourceUri:r.source_uri,trustTier:r.trust_tier,excerpt:String(r.content).slice(0,360)};return{citation,domain:r.domain,score:Number(r.score.toFixed(5)),content:r.content}});
}

export function groundingContext(evidence:AiEvidence[]){if(!evidence.length)return'NO VERIFIED EVIDENCE WAS RETRIEVED.';return evidence.map((e)=>`[${e.citation.id}] ${e.citation.title} (${e.citation.trustTier}; quality=${e.score.toFixed(2)})\n${e.content}`).join('\n\n')}
