'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Icons } from '@/components/icons';
import { CopilotMessage } from './copilot-message';
import { streamCopilot } from '@/lib/powerchain/ai-api';
import type { AiCapabilities, CopilotResponse } from './types';

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  certainty?: string;
  citations?: any[];
  provider?: string;
  model?: string;
  toolRuns?: Array<{ name: string; mode: string; ok: boolean }>;
  unsupportedClaims?: string[];
  messageId?: string;
  promptVersion?: string;
  fallbackCount?: number;
  evidenceScore?: number;
};

type Conversation = {
  id: string;
  title: string | null;
  assistant_id: string;
  response_style: string;
  updated_at: string;
};

const STARTERS = [
  ['Portfolio', 'Explain my current staking and reward position using verified account state.'],
  ['Protocol', 'Explain the current staking, reward and governance safety model.'],
  ['Network', 'Check the evidence needed to assess PowerChain network health.'],
  ['Renewables', 'Explain how verified renewable evidence flows into PowerChain economics.'],
];

export function CopilotWorkspace() {
  const { toast } = useToast();
  const [caps, setCaps] = useState<AiCapabilities | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [text, setText] = useState('');
  const [assistantId, setAssistantId] = useState('powerchain');
  const [style, setStyle] = useState('professional');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [loraAdapter, setLoraAdapter] = useState('');
  const [conversationId, setConversationId] = useState<string>();
  const [pending, setPending] = useState(false);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [stageText, setStageText] = useState('Retrieving evidence and reasoning…');

  async function refreshConversations() {
    try {
      const result = await api<{ conversations: Conversation[] }>('/api/v1/ai/conversations');
      setConversations(result.conversations ?? []);
    } catch {
      setConversations([]);
    }
  }

  useEffect(() => {
    void api<AiCapabilities>('/api/v1/ai/capabilities')
      .then((x) => {
        setCaps(x);
        setProvider(x.defaultProvider);
        setModel(x.defaultModel);
        const assistant = x.assistants.find((item) => item.id === 'powerchain');
        if (assistant) setStyle(assistant.defaultStyle);
        void refreshConversations();
      })
      .catch((e) => toast({ title: 'Copilot unavailable', message: e.message, level: 'error' }));
  }, [toast]);

  const tools = useMemo(() => caps?.tools.filter((item) => item.mode !== 'STATE_CHANGE') ?? [], [caps]);

  async function loadConversation(id: string) {
    if (pending) return;
    try {
      const result = await api<any>(`/api/v1/ai/conversations/${id}/messages`);
      const loaded: Msg[] = (result.messages ?? [])
        .filter((item: any) => item.role === 'USER' || item.role === 'ASSISTANT')
        .map((item: any) => ({
          id: String(item.id),
          role: item.role === 'USER' ? 'user' : 'assistant',
          text: String(item.content ?? ''),
          certainty: item.certainty ?? undefined,
          citations: Array.isArray(item.citations) ? item.citations : [],
          provider: item.provider ?? undefined,
          model: item.model ?? undefined,
          toolRuns: Array.isArray(item.tool_runs) ? item.tool_runs : [],
          unsupportedClaims: [],
          messageId: String(item.id),
        }));
      setConversationId(id);
      setAssistantId(result.conversation?.assistant_id ?? 'powerchain');
      setStyle(result.conversation?.response_style ?? 'professional');
      setMessages(loaded);
    } catch (e: any) {
      toast({ title: 'Conversation unavailable', message: e.message, level: 'error' });
    }
  }

  function newConversation() {
    if (pending) return;
    setConversationId(undefined);
    setMessages([]);
    setText('');
  }

  async function send(value = text) {
    const message = value.trim();
    if (!message || pending || !caps?.enabled) return;
    setText('');
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: message }]);
    setPending(true);
    try {
      const result = await streamCopilot({
        message,
        assistantId,
        style,
        provider: provider || undefined,
        model: model || undefined,
        conversationId,
        tools: selectedTools,
        loraAdapter: loraAdapter || undefined,
      }, (stage) => setStageText(stage.message));
      setConversationId(result.conversationId);
      setMessages((current) => [...current, {
        id: result.requestId,
        role: 'assistant',
        text: result.response.answer,
        certainty: result.response.certainty,
        citations: result.response.citations,
        provider: result.response.provider,
        model: result.response.model,
        toolRuns: result.response.toolRuns,
        unsupportedClaims: result.response.unsupportedClaims,
        messageId: result.response.messageId,
        promptVersion: result.response.promptVersion,
        fallbackCount: result.response.fallbackCount,
        evidenceScore: result.response.evidenceScore,
      }]);
      void refreshConversations();
    } catch (e: any) {
      toast({ title: 'Copilot request failed', message: e.message, level: 'error' });
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: 'I could not complete that request. No transaction or protocol action was performed.',
        certainty: 'UNAVAILABLE',
      }]);
    } finally {
      setPending(false);
      setStageText('Retrieving evidence and reasoning…');
    }
  }

  return <div className="copilot-layout">
    <section className="copilot-main">
      <div className="copilot-hero">
        <div>
          <span className="eyebrow">POWERCHAIN AI · SECURED</span>
          <h1>Copilot</h1>
          <p>Evidence-first analysis for staking, Solana, Sui, renewable infrastructure and PowerChain operations.</p>
        </div>
        <div className="copilot-safety">
          <Icons.ShieldCheck size={20} />
          <div><b>Read-only AI authority</b><span>Wallet signatures and state changes remain outside the LLM.</span></div>
        </div>
      </div>

      {messages.length === 0 ? <div className="copilot-empty">
        <div className="copilot-orb"><Icons.Sparkles size={30} /></div>
        <h2>Ask PowerChain</h2>
        <p>Operational answers cite verified knowledge when available and abstain when evidence is insufficient.</p>
        {!caps?.enabled && <div className="information"><Icons.Info size={16} /><div><b>AI runtime is disabled</b><p>Configure the server AI provider and set AI_ENABLED=true before using Copilot.</p></div></div>}
        <div className="copilot-starters">
          {STARTERS.map(([label, prompt]) => <button key={label} disabled={!caps?.enabled} onClick={() => void send(prompt)}>
            <span>{label}</span><b>{prompt}</b><Icons.ArrowUpRight size={15} />
          </button>)}
        </div>
      </div> : <div className="copilot-thread">
        {messages.map((message) => <CopilotMessage key={message.id} role={message.role} text={message.text} certainty={message.certainty} citations={message.citations} provider={message.provider} model={message.model} toolRuns={message.toolRuns} unsupportedClaims={message.unsupportedClaims} messageId={message.messageId} promptVersion={message.promptVersion} fallbackCount={message.fallbackCount} evidenceScore={message.evidenceScore} />)}
        {pending && <div className="copilot-thinking"><span /><span /><span />{stageText}</div>}
      </div>}

      <form className="copilot-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Ask about staking, protocol state, rewards, governance, Solana, Sui or renewable evidence…" rows={3} disabled={!caps?.enabled} />
        <div className="copilot-composer-row">
          <span><Icons.ShieldCheck size={14} /> Evidence-first · No wallet signing</span>
          <button className="primary compact" disabled={!caps?.enabled || !text.trim() || pending}>{pending ? 'Working…' : 'Send'} <Icons.Send size={14} /></button>
        </div>
      </form>
    </section>

    <aside className="copilot-rail">
      <div className="card copilot-history-card">
        <div className="section-title-row"><h3>Conversations</h3><button className="ghost compact" onClick={newConversation}><Icons.Plus size={13} />New</button></div>
        <div className="copilot-history">
          {conversations.length ? conversations.slice(0, 8).map((item) => <button key={item.id} className={conversationId === item.id ? 'active' : ''} onClick={() => void loadConversation(item.id)}>
            <b>{item.title || 'Conversation'}</b><span>{new Date(item.updated_at).toLocaleDateString()}</span>
          </button>) : <p className="small">No saved conversations yet.</p>}
        </div>
      </div>

      <div className="card">
        <h3>Assistant</h3>
        <select value={assistantId} onChange={(event) => { setAssistantId(event.target.value); const assistant = caps?.assistants.find((item) => item.id === event.target.value); if (assistant) setStyle(assistant.defaultStyle); }}>
          {caps?.assistants.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
        <p className="small">{caps?.assistants.find((item) => item.id === assistantId)?.description}</p>
      </div>

      <div className="card">
        <h3>Response style</h3>
        <select value={style} onChange={(event) => setStyle(event.target.value)}>
          {['professional', 'concise', 'operator', 'analyst', 'technical', 'executive'].map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}
        </select>
      </div>

      <div className="card">
        <h3>Model routing</h3>
        <label className="ai-field"><span>Provider</span><select value={provider} onChange={(event) => { setProvider(event.target.value); setLoraAdapter(''); }}>{caps?.providers.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select></label>
        <label className="ai-field"><span>Model</span><input value={model} onChange={(event) => setModel(event.target.value)} /></label>
        {provider === 'local' && caps?.loraAdapters.length ? <label className="ai-field"><span>LoRA adapter</span><select value={loraAdapter} onChange={(event) => setLoraAdapter(event.target.value)}><option value="">Base model</option>{caps.loraAdapters.map((item) => <option value={item} key={item}>{item}</option>)}</select></label> : null}
        <div className="ai-provider-health"><span className={`status-dot ${(caps?.providers.find((item) => item.id === provider)?.health?.state ?? 'UNKNOWN').toLowerCase()}`} /> <span>{caps?.providers.find((item) => item.id === provider)?.health?.state ?? 'Unknown'} provider health</span></div>
        {caps?.providerFallbacks?.length ? <p className="small">Failover: {caps.providerFallbacks.join(' → ')}</p> : null}
      </div>

      <div className="card">
        <h3>Read-only tools</h3><p className="small">Relevant trusted tools are selected automatically. You can also request additional read-only tools.</p>
        <div className="ai-tool-list">{tools.map((tool) => <label key={tool.name}>
          <input type="checkbox" checked={selectedTools.includes(tool.name)} onChange={(event) => setSelectedTools((current) => event.target.checked ? [...current, tool.name] : current.filter((item) => item !== tool.name))} />
          <span><b>{tool.name}</b><small>{tool.description}</small></span>
        </label>)}</div>
      </div>

      <div className="card ai-grounding-card">
        <h3>Grounding policy</h3>
        <div className="detail-list">
          <div><span>RAG</span><b>{caps?.grounding.rag ? 'Enabled' : 'Unavailable'}</b></div>
          <div><span>Missing evidence</span><b>Abstain</b></div>
          <div><span>Factual citations</span><b>{caps?.grounding.perFactualSentenceCitation ? 'Required' : 'Policy unavailable'}</b></div>
          <div><span>State changes</span><b>Blocked</b></div>
          <div><span>MPC signing</span><b>Outside AI</b></div>
          <div><span>Prompt policy</span><b>{caps?.prompt?.version ?? 'Unavailable'}</b></div>
          <div><span>24h evals</span><b>{caps?.evals?.passRate == null ? 'Not run' : `${Math.round(caps.evals.passRate * 100)}% pass`}</b></div>
        </div>
        <p className="small">No LLM can guarantee zero hallucinations. PowerChain reduces risk by requiring evidence for operational claims and refusing unsupported answers.</p>
      </div>
    </aside>
  </div>;
}
