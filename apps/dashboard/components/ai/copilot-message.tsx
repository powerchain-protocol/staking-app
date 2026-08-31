'use client';

import { useState } from 'react';
import { EvidenceBadge, ProviderBadge } from '@/ai/providers';
import { Icons } from '@/components/icons';
import { api } from '@/lib/api';
import type { Citation } from './types';

type ToolRun = { name: string; mode: string; ok: boolean };

function safeSourceUri(value?: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null; }
  catch { return null; }
}

function AnswerContent({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  return <div className="copilot-answer-content">{lines.map((line, index) => {
    const value = line.trim();
    if (!value) return <div className="copilot-answer-space" key={index} />;
    if (/^#{1,3}\s+/.test(value)) return <h4 key={index}>{value.replace(/^#{1,3}\s+/, '')}</h4>;
    if (/^[-*]\s+/.test(value)) return <div className="copilot-answer-bullet" key={index}><span>•</span><p>{value.replace(/^[-*]\s+/, '')}</p></div>;
    if (/^\d+[.)]\s+/.test(value)) { const match = value.match(/^(\d+)[.)]\s+(.*)$/); return <div className="copilot-answer-bullet numbered" key={index}><span>{match?.[1]}.</span><p>{match?.[2]}</p></div>; }
    return <p key={index}>{value}</p>;
  })}</div>;
}

export function CopilotMessage({ role, text, certainty, citations = [], provider, model, toolRuns = [], unsupportedClaims = [], messageId, promptVersion, fallbackCount = 0, evidenceScore }: {
  role: 'user' | 'assistant'; text: string; certainty?: string; citations?: Citation[]; provider?: string; model?: string; toolRuns?: ToolRun[]; unsupportedClaims?: string[]; messageId?: string; promptVersion?: string; fallbackCount?: number; evidenceScore?: number;
}) {
  const [copied, setCopied] = useState(false); const [feedback, setFeedback] = useState<1|-1|0>(0); const [feedbackPending, setFeedbackPending] = useState(false);
  async function copyAnswer() { try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch {} }
  async function rate(value:1|-1){if(!messageId||feedbackPending)return;setFeedbackPending(true);try{await api('/api/v1/ai/feedback',{method:'POST',body:JSON.stringify({messageId,rating:value})});setFeedback(value)}catch{}finally{setFeedbackPending(false)}}
  return <article className={`copilot-message ${role}`}>
    <div className="copilot-message-head">
      <b>{role === 'assistant' ? 'PowerChain Copilot' : 'You'}</b>
      {role === 'assistant' && <div className="copilot-badges">{certainty && <EvidenceBadge certainty={certainty} />} {provider && <ProviderBadge provider={provider} />} {model && <span className="badge neutral">{model}</span>}</div>}
    </div>
    <div className="copilot-message-body"><AnswerContent text={text} /></div>
    {role === 'assistant' && <div className="copilot-message-actions">
      <button type="button" onClick={() => void copyAnswer()} aria-label="Copy response"><Icons.Copy size={13} />{copied ? 'Copied' : 'Copy'}</button>
      {messageId && <><button type="button" className={feedback===1?'active':''} disabled={feedbackPending} onClick={()=>void rate(1)} aria-label="Helpful response"><Icons.Check size={13}/>Helpful</button><button type="button" className={feedback===-1?'active warning':''} disabled={feedbackPending} onClick={()=>void rate(-1)} aria-label="Unhelpful response"><Icons.X size={13}/>Needs work</button></>}
      {toolRuns.length > 0 && <span>{toolRuns.filter((tool) => tool.ok).length}/{toolRuns.length} read tools available</span>}
      {fallbackCount > 0 && <span>{fallbackCount} provider failover{fallbackCount===1?'':'s'}</span>}
      {typeof evidenceScore==='number' && <span>Evidence {Math.round(evidenceScore*100)}%</span>}
      {promptVersion && <span>{promptVersion}</span>}
      {unsupportedClaims.length > 0 && <span className="warning">{unsupportedClaims.length} unsupported claim{unsupportedClaims.length === 1 ? '' : 's'} omitted</span>}
    </div>}
    {citations.length > 0 && <div className="copilot-citations"><b>Evidence</b>{citations.map((citation) => {
      const href = safeSourceUri(citation.sourceUri);
      return <div key={citation.id} className="copilot-citation"><div><strong>{citation.title}</strong><span>{citation.trustTier} · {citation.sourceType}</span></div><p>{citation.excerpt}</p>{href && <a href={href} target="_blank" rel="noreferrer">Open source <Icons.ArrowUpRight size={11} /></a>}</div>;
    })}</div>}
  </article>;
}
