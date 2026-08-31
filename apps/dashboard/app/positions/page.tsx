'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { pools, PWRC_REFERENCE_PRICE_USD } from '@/lib/data';
import { LineChart } from '@/components/charts';
import { Icons } from '@/components/icons';
import { useWallet } from '@/components/wallet-context';
import { useRealtime } from '@/hooks/use-realtime';
import { createIntent, executePreparedSolanaIntent, pollStakingIntent } from '@/lib/client/execution';
import { atomicToNumber, formatAtomic, parsePwrc } from '@/lib/client/pwrc';

type Filter = 'All' | 'Active' | 'Locked' | 'Unbonding' | 'Withdrawable' | 'Withdrawn';
type PositionRow = Record<string, any>;
type Action = 'CLAIM' | 'COMPOUND' | 'REQUEST_UNSTAKE' | 'CANCEL_UNSTAKE' | 'WITHDRAW' | 'INCREASE';

const pretty = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replaceAll('_', ' ');
const date = (value: unknown) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(String(value))) : '—';

export default function Positions() {
  const wallet = useWallet();
  const [filter, setFilter] = useState<Filter>('All');
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [claimables, setClaimables] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [increaseAmount, setIncreaseAmount] = useState('');
  const [execution, setExecution] = useState<{ stage: string; detail?: string; error?: string; signature?: string } | null>(null);

  const load = useCallback(async () => {
    if (!wallet.connected) { setPositions([]); setClaimables({}); setSelectedId(null); return; }
    setLoading(true); setLoadError(null);
    try {
      const [pRes, rRes] = await Promise.all([fetch('/api/v1/staking/positions', { cache: 'no-store' }), fetch('/api/v1/rewards/overview', { cache: 'no-store' })]);
      const pData = await pRes.json(); const rData = await rRes.json();
      if (!pRes.ok) throw new Error(pData?.error?.message ?? 'Failed to load positions');
      const rows = pData.positions ?? [];
      setPositions(rows); setSelectedId((current) => current && rows.some((p: any) => p.id === current) ? current : rows[0]?.id ?? null);
      if (rRes.ok) setClaimables(Object.fromEntries((rData.positions ?? []).map((x: any) => [x.positionId, x.claimableAtomic])));
    } catch (e) { setLoadError(e instanceof Error ? e.message : 'Could not load positions'); }
    finally { setLoading(false); }
  }, [wallet.connected]);

  useEffect(() => { void load(); }, [load]);
  const onRealtimeUpdate=useCallback(()=>{void load()},[load]);
  useRealtime(['staking.intent','staking.position','rewards.claim'],onRealtimeUpdate,wallet.connected);

  const selected = positions.find((p) => p.id === selectedId) ?? null;
  const decimals = wallet.balances?.pwrcDecimals ?? 9;
  const filtered = useMemo(() => filter === 'All' ? positions : positions.filter((p) => pretty(String(p.status)) === filter), [filter, positions]);
  const totalAtomic = positions.filter((p) => !['WITHDRAWN','CLOSED'].includes(String(p.status))).reduce((sum, p) => sum + BigInt(String(p.principal_atomic ?? 0)), 0n);
  const votingAtomic = positions.reduce((sum, p) => sum + BigInt(String(p.effective_weight_atomic ?? 0)), 0n);
  const totalClaimableAtomic = Object.values(claimables).reduce((sum, x) => sum + BigInt(x || '0'), 0n);
  const nextUnlock = positions.map((p) => p.unlock_at ? new Date(p.unlock_at) : null).filter((d): d is Date => !!d && d > new Date()).sort((a,b) => a.getTime()-b.getTime())[0];

  const runAction = async () => {
    if (!selected || !action || !wallet.walletKind) return;
    try {
      setExecution({ stage: 'Creating intent', detail: 'Validating current position lifecycle and policy.' });
      const body: Record<string, unknown> = { action, positionId: selected.id };
      if (action === 'INCREASE') body.amountAtomic = parsePwrc(increaseAmount, decimals).toString();
      const created = await createIntent('staking', body);
      const intentId = created.intent.id as string;
      setExecution({ stage: 'Wallet approval', detail: 'Review the exact server-prepared transaction in your wallet.' });
      const submitted = await executePreparedSolanaIntent({ kind: 'staking', intentId, walletKind: wallet.walletKind, walletName: wallet.walletName });
      if (submitted.status === 'AWAITING_EMBEDDED_WALLET') return;
      setExecution({ stage: 'Submitted', detail: 'Waiting for finality and reconciliation.', signature: submitted.signature });
      const final = await pollStakingIntent(intentId, (i) => setExecution({ stage: i.status, detail: 'Verifying chain state, ledger and receipt.', signature: i.submitted_signature ?? submitted.signature }));
      if (final?.status === 'RECONCILED') { await Promise.all([load(), wallet.refresh()]); setExecution({ stage: 'Reconciled', detail: 'Position state and immutable receipt are complete.', signature: final.submitted_signature }); }
      else if (final) setExecution({ stage: final.status, error: final.error_message ?? 'Action requires review.', signature: final.submitted_signature });
    } catch (e) { setExecution({ stage: 'Failed', error: e instanceof Error ? e.message : 'Position action failed.' }); }
  };

  const openAction = (next: Action) => { setExecution(null); setIncreaseAmount(''); setAction(next); };
  const principalNumber = selected ? atomicToNumber(String(selected.principal_atomic), decimals) : 0;
  const selectedClaimable = selected ? BigInt(claimables[selected.id] ?? '0') : 0n;
  const pool = selected ? pools.find((p) => p.id === selected.pool_id) : null;

  if (!wallet.connected) return <div className="page-wrap"><div className="stack"><div><h1 className="page-title">My Positions</h1><div className="page-sub">Authenticated, reconciled PWRC staking positions appear here.</div></div><section className="card empty-state"><Icons.LockKeyhole size={28} /><b>Connect and authenticate a wallet</b><span className="small">PowerChain does not show fabricated account positions while disconnected.</span><button className="primary" onClick={() => wallet.setModal(true)}>Connect wallet</button></section></div></div>;

  return <div className="page-wrap">
    <div className="stack">
      <div className="page-heading-row"><div><h1 className="page-title">My Positions</h1><div className="page-sub">Indexed from reconciled staking intents; reward claimability is calculated from funded epoch indexes.</div></div><Link href="/stake" className="primary"><Icons.Plus size={16} />Stake more</Link></div>
      {loadError && <div className="security-note"><Icons.TriangleAlert size={17} /><div><b>Positions unavailable</b><div className="small">{loadError}</div></div></div>}
      <section className="card" style={{ padding: 0 }}><div className="stats"><div className="stat"><div className="stat-label">Total staked</div><div className="stat-value mono">{formatAtomic(totalAtomic, decimals)} PWRC</div><div className="small">≈ ${(atomicToNumber(totalAtomic, decimals)*PWRC_REFERENCE_PRICE_USD).toFixed(2)} USD reference</div></div><div className="stat"><div className="stat-label">Claimable rewards</div><div className="stat-value green mono">{formatAtomic(totalClaimableAtomic, decimals)} PWRC</div><div className="small">Authoritative epoch indexes</div></div><div className="stat"><div className="stat-label">Voting weight</div><div className="stat-value mono">{formatAtomic(votingAtomic, decimals)}</div><div className="small">Derived from eligible positions</div></div><div className="stat"><div className="stat-label">Next unlock</div><div className="stat-value">{nextUnlock ? date(nextUnlock) : '—'}</div><div className="small">Lifecycle refreshed server-side</div></div></div></section>

      <section className="card positions-card"><div className="tabs scroll-tabs" role="tablist" aria-label="Position filters">{(['All','Active','Locked','Unbonding','Withdrawable','Withdrawn'] as Filter[]).map((x) => <button role="tab" aria-selected={filter===x} className={'tab '+(filter===x?'active':'')} key={x} onClick={() => setFilter(x)}>{x === 'All' ? 'All Positions' : x}</button>)}</div>{loading ? <div className="empty-state"><span className="small">Loading reconciled positions…</span></div> : <div className="table-scroll"><table className="table positions-table"><thead><tr><th>Position</th><th>Status</th><th>Principal</th><th>Claimable</th><th>Unlock</th><th></th></tr></thead><tbody>{filtered.map((p) => <tr key={p.id} className={selected?.id===p.id?'selected-row':''} onClick={() => setSelectedId(p.id)}><td><b>{pools.find((x)=>x.id===p.pool_id)?.name ?? p.pool_id}</b><div className="small mono">{String(p.id).slice(0,8)}…</div></td><td><span className="badge"><span className="dot" />{pretty(String(p.status))}</span></td><td><b className="mono">{formatAtomic(String(p.principal_atomic),decimals)} PWRC</b></td><td><b className="green mono">{formatAtomic(claimables[p.id] ?? '0',decimals)} PWRC</b></td><td><b>{date(p.unlock_at)}</b></td><td><button className="secondary compact" onClick={(e)=>{e.stopPropagation();setSelectedId(p.id)}}>Manage</button></td></tr>)}</tbody></table></div>}{!loading && !filtered.length && <div className="empty-state"><Icons.CalendarDays size={24}/><b>No {filter.toLowerCase()} positions</b><span className="small">Only authoritative reconciled positions are displayed.</span></div>}</section>

      <div className="grid-2"><section className="card"><div className="row"><div className="section-title">Reward index activity</div><span className="data-badge">Live when configured</span></div><div className="metric mono">{formatAtomic(totalClaimableAtomic,decimals)} <span>PWRC</span></div><LineChart /></section><section className="card"><div className="section-title">Accounting boundary</div>{[['Principal','USER_STAKED_PWRC'],['Claimable','STAKING_REWARD_LIABILITY'],['Wallet','USER_AVAILABLE_PWRC'],['Receipt','Immutable hash chain']].map(([a,b])=><div className="list-item" key={a}><span>{a}</span><b className="mono">{b}</b></div>)}</section></div>
    </div>

    <aside className="stack">{selected ? <section className="card position-detail"><div className="row"><div><div className="row justify-start"><b>{(pool?.name ?? selected.pool_id).toUpperCase()}</b><span className="badge">{pretty(String(selected.status))}</span></div><div className="small mono">Position {String(selected.id).slice(0,8)}…</div></div><span className="data-badge">Reconciled</span></div><div className="divider"/><div className="small">Staked principal</div><div className="metric-lg mono">{formatAtomic(String(selected.principal_atomic),decimals)} <span>PWRC</span></div><div className="small">≈ ${(principalNumber*PWRC_REFERENCE_PRICE_USD).toFixed(2)} USD reference</div>{[['Claimable rewards',`${formatAtomic(selectedClaimable,decimals)} PWRC`],['Governance weight',formatAtomic(String(selected.effective_weight_atomic),decimals)],['Pool policy',selected.policy_version],['Unlock date',date(selected.unlock_at)],['Unbonding ends',date(selected.unbonding_ends_at)],['On-chain account',selected.onchain_address ? `${String(selected.onchain_address).slice(0,6)}…${String(selected.onchain_address).slice(-5)}` : '—'],['Slashable','No']].map(([a,b])=><div className="summary-item" key={a}><span className="small">{a}</span><b>{b}</b></div>)}<button className="primary full-button" disabled={selectedClaimable<=0n || !['ACTIVE','LOCKED'].includes(String(selected.status))} onClick={()=>openAction('CLAIM')}>Claim rewards</button><div className="dual-actions"><button className="secondary" disabled={!['ACTIVE','LOCKED'].includes(String(selected.status))} onClick={()=>openAction('INCREASE')}><Icons.Plus size={15}/>Add PWRC</button>{String(selected.status)==='UNBONDING'?<button className="secondary" onClick={()=>openAction('CANCEL_UNSTAKE')}>Cancel unstake</button>:String(selected.status)==='WITHDRAWABLE'?<button className="secondary" onClick={()=>openAction('WITHDRAW')}>Withdraw</button>:<button className="secondary" disabled={String(selected.status)!=='ACTIVE'} onClick={()=>openAction('REQUEST_UNSTAKE')}>Unstake</button>}</div><div className="security-note"><Icons.ShieldCheck size={16}/><div className="small">Unstake amount is server-derived from the reconciled position. Locked positions cannot enter unbonding early.</div></div></section> : <section className="card empty-state"><span className="small">Select a position to manage it.</span></section>}</aside>

    {action && selected && <div className="modal-backdrop" onMouseDown={()=>!execution&&setAction(null)}><div className="modal" role="dialog" aria-modal="true" onMouseDown={(e)=>e.stopPropagation()}><div className="row"><div><div className="modal-title">{pretty(action)}</div><div className="small">Position {String(selected.id).slice(0,8)}… · {pool?.name}</div></div><button className="icon-button" onClick={()=>setAction(null)}>×</button></div>{action==='INCREASE'&&<div><label className="field-label" htmlFor="increase">Additional PWRC</label><div className="amount-input"><input id="increase" inputMode="decimal" value={increaseAmount} onChange={(e)=>setIncreaseAmount(e.target.value.replace(/[^0-9.]/g,''))} placeholder="0"/><b>PWRC</b></div><div className="small" style={{marginTop:7}}>Available: {formatAtomic(wallet.balances?.pwrcAtomic ?? '0',decimals)} PWRC</div></div>}<div className="review-amount"><span className="small">Current principal</span><div className="metric-lg mono">{formatAtomic(String(selected.principal_atomic),decimals)} <span>PWRC</span></div>{action==='CLAIM'&&<span className="green">Claimable {formatAtomic(selectedClaimable,decimals)} PWRC</span>}</div>{execution&&<div className="security-note"><Icons.Activity size={17}/><div><b>{execution.stage}</b><div className="small">{execution.error??execution.detail}</div>{execution.signature&&<div className="small mono">{execution.signature}</div>}</div></div>}<button className="primary full-button" disabled={!!execution&&!['Failed','REQUIRES_REVIEW'].includes(execution.stage)||(action==='INCREASE'&&!increaseAmount)} onClick={runAction}>{execution?'Processing…':wallet.embedded?'Confirm with PowerChain Wallet':`Review in ${wallet.walletName??'wallet'}`}</button></div></div>}
  </div>;
}
