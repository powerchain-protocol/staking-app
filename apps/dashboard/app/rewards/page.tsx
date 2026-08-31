'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LineChart } from '@/components/charts';
import { Icons } from '@/components/icons';
import { useWallet } from '@/components/wallet-context';
import { useRealtime } from '@/hooks/use-realtime';
import { createIntent, executePreparedSolanaIntent, pollStakingIntent } from '@/lib/client/execution';
import { formatAtomic } from '@/lib/client/pwrc';
import { pools } from '@/lib/data';

type RewardPosition = { positionId: string; claimableAtomic: string; byEpoch: Array<{ epochId: string; claimableAtomic: string }> };
type Position = Record<string, any>;

export default function Rewards() {
  const wallet = useWallet();
  const decimals = wallet.balances?.pwrcDecimals ?? 9;
  const [overview, setOverview] = useState<{ claimableAtomic: string; positions: RewardPosition[] }>({ claimableAtomic: '0', positions: [] });
  const [positions, setPositions] = useState<Position[]>([]);
  const [coverage, setCoverage] = useState<any>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<'CLAIM' | 'COMPOUND'>('CLAIM');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [execution, setExecution] = useState<{ stage: string; detail?: string; error?: string; signature?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wallet.connected) { setOverview({ claimableAtomic: '0', positions: [] }); setPositions([]); setCoverage(null); setReceipts([]); return; }
    setError(null);
    try {
      const [o, p, c, r] = await Promise.all([
        fetch('/api/v1/rewards/overview', { cache: 'no-store' }),
        fetch('/api/v1/staking/positions', { cache: 'no-store' }),
        fetch('/api/v1/rewards/coverage', { cache: 'no-store' }),
        fetch('/api/v1/receipts', { cache: 'no-store' }),
      ]);
      const od = await o.json(); const pd = await p.json(); const cd = await c.json().catch(()=>null); const rd = await r.json().catch(()=>({receipts:[]}));
      if (!o.ok) throw new Error(od?.error?.message ?? 'Rewards could not be indexed');
      setOverview(od); setPositions(p.ok ? pd.positions ?? [] : []); setCoverage(c.ok ? cd : null);
      setReceipts((r.ok ? rd.receipts ?? [] : []).filter((x:any)=>x.receipt_type==='STAKING_ACTION'));
      setSelected((current) => current && (od.positions ?? []).some((x:RewardPosition)=>x.positionId===current) ? current : od.positions?.find((x:RewardPosition)=>BigInt(x.claimableAtomic)>0n)?.positionId ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load rewards'); }
  }, [wallet.connected]);

  useEffect(() => { void load(); }, [load]);
  const onRealtimeUpdate=useCallback(()=>{void load()},[load]);
  useRealtime(['rewards.claim','rewards.epoch','rewards.coverage','staking.position','staking.intent'],onRealtimeUpdate,wallet.connected);

  const rewardRows = useMemo(() => overview.positions.map((reward) => ({ reward, position: positions.find((p)=>p.id===reward.positionId) })), [overview, positions]);
  const selectedReward = overview.positions.find((x)=>x.positionId===selected) ?? null;

  const execute = async () => {
    if (!selectedReward || !wallet.walletKind) return;
    try {
      setExecution({ stage: 'Creating intent', detail: 'Crystallizing the current funded reward index and freezing an authoritative claim quote.' });
      const created = await createIntent('staking', { action: mode, positionId: selectedReward.positionId });
      const intentId = created.intent.id as string;
      setExecution({ stage: 'Wallet approval', detail: 'Only the server-prepared claim transaction can be signed.' });
      const submitted = await executePreparedSolanaIntent({ kind:'staking', intentId, walletKind:wallet.walletKind, walletName:wallet.walletName });
      if (submitted.status === 'AWAITING_EMBEDDED_WALLET') return;
      setExecution({ stage:'Submitted', detail:'Waiting for finality, reward-liability settlement and receipt creation.', signature:submitted.signature });
      const final = await pollStakingIntent(intentId, (i)=>setExecution({stage:i.status,detail:'Reconciling reward settlement.',signature:i.submitted_signature??submitted.signature}));
      if (final?.status==='RECONCILED') { await Promise.all([load(),wallet.refresh()]); setExecution({stage:'Reconciled',detail:'Reward settlement and immutable receipt are complete.',signature:final.submitted_signature}); }
      else if (final) setExecution({stage:final.status,error:final.error_message??'Reward claim requires review.',signature:final.submitted_signature});
    } catch (e) { setExecution({stage:'Failed',error:e instanceof Error?e.message:'Reward execution failed.'}); }
  };

  if (!wallet.connected) return <div className="page-wrap"><div className="stack"><div><h1 className="page-title">Rewards</h1><div className="page-sub">Funded staking rewards are calculated from reconciled positions and reward epochs.</div></div><section className="card empty-state"><Icons.Gift size={28}/><b>Connect your wallet to view rewards</b><span className="small">No account rewards are fabricated before authentication.</span><button className="primary" onClick={()=>wallet.setModal(true)}>Connect wallet</button></section></div></div>;

  return <div className="page-wrap">
    <div className="stack">
      <div className="page-heading-row"><div><h1 className="page-title">Rewards</h1><div className="page-sub">Earn PWRC for funded participation across the PowerChain ecosystem.</div></div><span className="data-badge">Not guaranteed yield</span></div>
      {error&&<div className="security-note"><Icons.TriangleAlert size={17}/><div><b>Rewards unavailable</b><div className="small">{error}</div></div></div>}
      <section className="card" style={{padding:0}}><div className="stats"><div className="stat"><div className="stat-label">Available to claim</div><div className="stat-value green mono">{formatAtomic(overview.claimableAtomic,decimals)} PWRC</div><div className="small">Across {overview.positions.length} indexed positions</div></div><div className="stat"><div className="stat-label">Reward vault</div><div className="stat-value">{coverage ? (coverage.covered?'Covered':'Deficit') : 'Unavailable'}</div><div className="small">{coverage ? `${formatAtomic(coverage.balanceAtomic,decimals)} PWRC funded` : 'Configure vault to verify'}</div></div><div className="stat"><div className="stat-label">Accrued liability</div><div className="stat-value mono">{coverage?formatAtomic(coverage.accruedLiabilityAtomic,decimals):'—'} PWRC</div><div className="small">Independent of staking principal</div></div><div className="stat"><div className="stat-label">Coverage ratio</div><div className="stat-value">{coverage?.coverageBps==null?'—':`${(coverage.coverageBps/100).toFixed(2)}%`}</div><div className="small">Funded vault ÷ liability</div></div></div></section>

      <section className="card"><div className="row"><div><div className="section-title">Reward index</div><div className="small">Indexes advance server-side from funded epoch budgets and eligible staking weight.</div></div><span className="badge">Epoch accounting</span></div><LineChart /></section>

      <section className="card"><div className="row"><div><div className="section-title">Claimable by position</div><div className="small">Each claim uses a frozen server-side quote to prevent client reward manipulation.</div></div><span className="data-badge">{rewardRows.length} positions</span></div><div className="table-scroll"><table className="table"><thead><tr><th>Position</th><th>Pool</th><th>Claimable</th><th>Epochs</th><th></th></tr></thead><tbody>{rewardRows.map(({reward,position})=><tr key={reward.positionId}><td className="mono">{reward.positionId.slice(0,8)}…</td><td><b>{pools.find((p)=>p.id===position?.pool_id)?.name??position?.pool_id??'—'}</b></td><td><b className="green mono">{formatAtomic(reward.claimableAtomic,decimals)} PWRC</b></td><td>{reward.byEpoch.length}</td><td><button className="secondary compact" disabled={BigInt(reward.claimableAtomic)<=0n} onClick={()=>{setSelected(reward.positionId);setMode('CLAIM');setExecution(null);setReviewOpen(true)}}>Claim</button></td></tr>)}</tbody></table></div>{!rewardRows.length&&<div className="empty-state"><span className="small">No indexed reward positions yet.</span></div>}</section>

      <section className="card"><div className="row"><div><div className="section-title">Immutable reward receipts</div><div className="small">Receipt hashes are chained in the database and protected against update/delete.</div></div><span className="badge"><Icons.BadgeCheck size={13}/>Receipted</span></div><div className="table-scroll"><table className="table"><thead><tr><th>Created</th><th>Action</th><th>Source</th><th>Chain signature</th><th>Hash</th></tr></thead><tbody>{receipts.slice(0,8).map((r:any)=><tr key={r.id}><td>{new Date(r.created_at).toLocaleString()}</td><td>{r.payload?.action??'STAKING'}</td><td className="mono">{String(r.source_id).slice(0,8)}…</td><td className="mono">{r.chain_signature?`${String(r.chain_signature).slice(0,8)}…`:'—'}</td><td className="mono">{String(r.receipt_hash).slice(0,10)}…</td></tr>)}</tbody></table></div></section>
    </div>

    <aside className="stack"><section className="card claim-card"><div className="section-title">Claimable rewards</div><div className="reward-source-row"><div className="iconbox"><Icons.Gift size={16}/></div><div><b>Staking Rewards</b><div className="small">Authoritative funded epochs</div></div><strong className="mono">{formatAtomic(overview.claimableAtomic,decimals)} PWRC</strong></div><div className="reward-source-row muted-source"><div className="iconbox"><Icons.Users size={16}/></div><div><b>Community Rewards</b><div className="small">Separate ecosystem program</div></div><span>—</span></div><div className="reward-source-row muted-source"><div className="iconbox"><Icons.Zap size={16}/></div><div><b>Energy Rewards</b><div className="small">Separate ecosystem program</div></div><span>—</span></div><div className="reward-source-row muted-source"><div className="iconbox"><Icons.Vote size={16}/></div><div><b>Governance Rewards</b><div className="small">Separate ecosystem program</div></div><span>—</span></div><div className="divider"/><div className="row"><span>Total staking claimable</span><b className="mono">{formatAtomic(overview.claimableAtomic,decimals)} PWRC</b></div><button className="primary full-button" disabled={!selectedReward||BigInt(selectedReward.claimableAtomic)<=0n} onClick={()=>{setMode('CLAIM');setExecution(null);setReviewOpen(true)}}>Claim selected rewards</button><button className="secondary full-button" disabled={!selectedReward||BigInt(selectedReward.claimableAtomic)<=0n} onClick={()=>{setMode('COMPOUND');setExecution(null);setReviewOpen(true)}}>Auto-Compound</button><div className="small center-note">Only staking rewards are wired to this staking engine. Other ecosystem rewards stay separate until their canonical programs are configured.</div></section><section className="card"><div className="row"><div className="section-title">Reward programs</div><span className="badge">Funded only</span></div>{[['Staking Program',coverage?.covered?'Active':'Coverage required'],['Community Energy Program','Separate'],['Energy Participation Program','Separate'],['Governance Program','Separate']].map(([a,b])=><div className="list-item" key={a}><span><b>{a}</b><div className="small">Policy-bound program</div></span><b className={b==='Active'?'green':''}>{b}</b></div>)}</section><section className="card"><div className="section-title">About rewards</div><div className="security-note"><Icons.ShieldCheck size={17}/><div className="small">Rewards are distributed from funded program budgets based on verified activity and policy. Reward-vault solvency is part of readiness.</div></div></section></aside>

    {selectedReward && reviewOpen && <RewardModal mode={mode} reward={selectedReward} decimals={decimals} execution={execution} close={()=>{ if (!execution || ['Failed','Reconciled','REQUIRES_REVIEW'].includes(execution.stage)) setReviewOpen(false); }} execute={execute}/>}
  </div>;
}

function RewardModal({mode,reward,decimals,execution,close,execute}:{mode:'CLAIM'|'COMPOUND';reward:RewardPosition;decimals:number;execution:{stage:string;detail?:string;error?:string;signature?:string}|null;close:()=>void;execute:()=>void}) {
  const canExecute=!execution || ['Failed','REQUIRES_REVIEW'].includes(execution.stage);
  return <div className="modal-backdrop" onMouseDown={()=>canExecute&&close()}><div className="modal" role="dialog" aria-modal="true" onMouseDown={(e)=>e.stopPropagation()}><div className="row"><div><div className="modal-title">{mode==='CLAIM'?'Claim rewards':'Compound rewards'}</div><div className="small">Position {reward.positionId.slice(0,8)}…</div></div><button className="icon-button" onClick={close}>×</button></div><div className="review-amount"><span className="small">Authoritative amount will be frozen at intent creation</span><div className="metric-lg mono">{formatAtomic(reward.claimableAtomic,decimals)} <span>PWRC</span></div></div>{execution?<div className="security-note"><Icons.Activity size={17}/><div><b>{execution.stage}</b><div className="small">{execution.error??execution.detail}</div>{execution.signature&&<div className="small mono">{execution.signature}</div>}</div></div>:<div className="security-note"><Icons.ShieldCheck size={17}/><div className="small">The server will crystallize the reward index and freeze an authoritative amount before wallet approval.</div></div>}<button className="primary full-button" disabled={!canExecute} onClick={execute}>{canExecute?(mode==='CLAIM'?'Continue to claim':'Continue to compound'):'Processing…'}</button></div></div>;
}
