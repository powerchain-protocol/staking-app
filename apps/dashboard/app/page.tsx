'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icons } from '@/components/icons';
import { LineChart } from '@/components/charts';
import { pools, PWRC_REFERENCE_PRICE_USD } from '@/lib/data';
import { useWallet } from '@/components/wallet-context';
import { useRealtime } from '@/hooks/use-realtime';
import { atomicToNumber, formatAtomic } from '@/lib/client/pwrc';
import { RenewableScene } from '@/components/renewable-scene';

type DashboardData = {
  positions: any[];
  claimableByPosition: Record<string,string>;
  claimableAtomic: string;
  votingWeightAtomic: string;
  activeProposals: number;
  ledger: any[];
};

const empty: DashboardData = { positions: [], claimableByPosition: {}, claimableAtomic: '0', votingWeightAtomic: '0', activeProposals: 0, ledger: [] };
const fmtDate = (value: unknown) => value ? new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(String(value))) : '—';

async function json(response: Response) { const data = await response.json(); if (!response.ok) throw new Error(data?.error?.message ?? `Request failed (${response.status})`); return data; }

export default function Overview() {
  const wallet = useWallet();
  const [data,setData]=useState<DashboardData>(empty);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const decimals=wallet.balances?.pwrcDecimals??9;

  const load=useCallback(async()=>{
    if(!wallet.connected){setData(empty);return;}
    setLoading(true);setError(null);
    try{
      const [positions,rewards,governance,proposals,ledger]=await Promise.all([
        json(await fetch('/api/v1/staking/positions',{cache:'no-store'})),
        json(await fetch('/api/v1/rewards/overview',{cache:'no-store'})),
        json(await fetch('/api/v1/governance/overview',{cache:'no-store'})),
        json(await fetch('/api/v1/governance/proposals',{cache:'no-store'})),
        json(await fetch('/api/v1/ledger',{cache:'no-store'})),
      ]);
      setData({
        positions:positions.positions??[],
        claimableByPosition:Object.fromEntries((rewards.positions??[]).map((x:any)=>[x.positionId,x.claimableAtomic])),
        claimableAtomic:rewards.claimableAtomic??'0',
        votingWeightAtomic:governance.votingWeightAtomic??'0',
        activeProposals:(proposals.proposals??[]).filter((p:any)=>p.status==='ACTIVE').length,
        ledger:ledger.entries??[],
      });
    }catch(e){setError(e instanceof Error?e.message:'Dashboard data unavailable');}
    finally{setLoading(false);}
  },[wallet.connected]);
  useEffect(()=>{void load()},[load]);
  const onRealtimeUpdate=useCallback(()=>{void load()},[load]);
  useRealtime(['staking.intent','staking.position','rewards.claim','governance.intent','governance.proposal','activity.event'],onRealtimeUpdate,wallet.connected);

  const livePositions=data.positions.filter((p)=>!['WITHDRAWN','CLOSED'].includes(String(p.status)));
  const totalStaked=livePositions.reduce((sum,p)=>sum+BigInt(String(p.principal_atomic??0)),0n);
  const primary=livePositions.find((p)=>['ACTIVE','LOCKED'].includes(String(p.status)))??livePositions[0]??null;
  const primaryPool=primary?pools.find((p)=>p.id===primary.pool_id):null;
  const primaryClaim=primary?BigInt(data.claimableByPosition[primary.id]??'0'):0n;
  const nextUnlock=livePositions.map((p)=>p.unlock_at?new Date(p.unlock_at):null).filter((d):d is Date=>!!d&&d>new Date()).sort((a,b)=>a.getTime()-b.getTime())[0]??null;
  const started=primary?.lock_started_at?new Date(primary.lock_started_at):null;
  const unlock=primary?.unlock_at?new Date(primary.unlock_at):null;
  const lockPct=started&&unlock?Math.max(0,Math.min(100,((Date.now()-started.getTime())/(unlock.getTime()-started.getTime()))*100)):0;
  const walletPwrc=BigInt(wallet.balances?.pwrcAtomic??'0');
  const totalUsd=atomicToNumber(totalStaked,decimals)*PWRC_REFERENCE_PRICE_USD;
  const recent=data.ledger.slice(0,3);

  return <div className="page-wrap">
    <div className="stack">
      <section className="card hero-card"><RenewableScene/><div className="row hero-row"><div className="hero-copy"><h1 className="hero-title">PWRC STAKING</h1><p className="hero-lead">Stake. Participate. Govern.</p><p className="page-sub hero-sub">Put PWRC to work across the PowerChain ecosystem through protocol participation, governance and network assurance.</p><div className="action-row"><Link href="/stake" className="primary">Stake PWRC <Icons.ArrowUpRight size={16}/></Link><Link href="/positions" className="secondary">View positions</Link></div></div><div className="card network-participation"><div className="row"><span className="small">Network participation</span><Icons.HelpCircle size={13}/></div><div className="metric">4.82B PWRC</div><div className="small">Total currently staked</div><div className="divider"/><div className="metric">23.4%</div><div className="small">Staking participation</div><div className="divider"/><span className="badge"><span className="dot"/> Operational</span></div></div></section>

      {!wallet.connected&&<section className="card connect-banner"><div><div className="section-title">Connect your wallet</div><p className="small">Authenticate to load your live PWRC balance, reconciled positions, funded rewards and governance weight.</p></div><button className="primary" onClick={()=>wallet.setModal(true)}>Connect wallet</button></section>}
      {error&&<div className="security-note"><Icons.TriangleAlert size={17}/><div><b>Account data unavailable</b><div className="small">{error}</div></div></div>}

      <section className={'card '+(!wallet.connected?'muted-private':'')} style={{padding:0}}><div className="stats">
        <div className="stat"><div className="stat-label">My staked</div><div className="stat-value mono">{wallet.connected?`${formatAtomic(totalStaked,decimals)} PWRC`:'—'}</div><div className="small">{wallet.connected?`≈ $${totalUsd.toFixed(2)} USD reference`:'Wallet required'}</div></div>
        <div className="stat"><div className="stat-label">Claimable</div><div className="stat-value green mono">{wallet.connected?`${formatAtomic(data.claimableAtomic,decimals)} PWRC`:'—'}</div><div className="small">{wallet.connected?'Funded epoch accounting':'Wallet required'}</div></div>
        <div className="stat"><div className="stat-label">Voting power</div><div className="stat-value mono">{wallet.connected?formatAtomic(data.votingWeightAtomic,decimals):'—'}</div><div className="small">{wallet.connected?'Derived eligible weight':'Wallet required'}</div></div>
        <div className="stat"><div className="stat-label">Next unlock</div><div className="stat-value">{wallet.connected?fmtDate(nextUnlock):'—'}</div><div className="small">{wallet.connected?(nextUnlock?'Reconciled lifecycle':'No scheduled unlock'):'Wallet required'}</div></div>
      </div></section>

      <div className="grid-2"><section className="card"><div className="row"><div className="section-title">{primary?'PRIMARY POSITION':'YOUR STAKING POSITION'}</div>{primaryPool&&<span className="badge">{primaryPool.short}</span>}</div>
        {wallet.connected&&primary?<><div className="metric-lg mono">{formatAtomic(primary.principal_atomic,decimals)} <span>PWRC</span></div><div className="small">≈ ${(atomicToNumber(primary.principal_atomic,decimals)*PWRC_REFERENCE_PRICE_USD).toFixed(2)} USD reference</div><div className="divider"/><div className="grid-3"><div><div className="small">Status</div><b>{String(primary.status).replaceAll('_',' ')}</b></div><div><div className="small">Claimable</div><b className="green mono">{formatAtomic(primaryClaim,decimals)} PWRC</b></div><div><div className="small">Voting weight</div><b>{formatAtomic(primary.effective_weight_atomic,decimals)}</b></div></div>{started&&unlock&&<div className="lock-block"><div className="row"><span className="small">Lock progress</span><span className="small">{Math.round(lockPct)}%</span></div><div className="progress"><span style={{width:`${lockPct}%`}}/></div><div className="row"><span className="small">Started {fmtDate(started)}</span><span className="small">Unlock {fmtDate(unlock)}</span></div></div>}<div className="action-row"><Link href="/rewards" className="primary">Claim rewards</Link><Link href="/stake" className="secondary">Add PWRC</Link><Link href="/positions" className="secondary push-right">Manage</Link></div></>:wallet.connected?<div className="empty-state"><Icons.CalendarDays size={26}/><b>No reconciled staking positions</b><span className="small">Create a staking intent to start a position.</span><Link href="/stake" className="primary">Stake PWRC</Link></div>:<div className="empty-state"><Icons.LockKeyhole size={26}/><b>Your positions stay private until wallet connection.</b><button className="primary" onClick={()=>wallet.setModal(true)}>Connect wallet</button></div>}
      </section><section className="stack"><div className="card"><div className="section-title">REWARDS</div><div className="metric mono">{wallet.connected?`${formatAtomic(data.claimableAtomic,decimals)} PWRC`:'—'}</div><div className="small">Available to claim</div><Link href="/rewards" className="primary full-button">View rewards</Link></div><div className="card"><div className="section-title">GOVERNANCE</div><div className="row"><div><div className="metric">{wallet.connected?formatAtomic(data.votingWeightAtomic,decimals):'—'}</div><div className="small">Your voting power</div></div><div><div className="metric">{data.activeProposals}</div><div className="small">Active proposals</div></div></div></div><div className="card"><div className="section-title">AVAILABLE PWRC</div><div className="metric mono">{wallet.connected?`${formatAtomic(walletPwrc,decimals)} PWRC`:'—'}</div><div className="small">Live wallet Token-2022 balance</div></div></section></div>

      <div className="grid-2"><section className="card"><div className="row"><div className="section-title">Recent ledger activity</div><Link href="/activity" className="ghost compact">View all <Icons.ChevronRight size={14}/></Link></div>{wallet.connected?(recent.length?recent.map((entry:any)=><div className="list-item" key={entry.id}><span><b>{String(entry.source_type).replaceAll('_',' ')}</b><div className="small">{new Date(entry.created_at).toLocaleString()}</div></span><b className="mono">{formatAtomic(String(entry.amount_atomic),decimals)} PWRC</b></div>):<div className="empty-state compact-empty"><span className="small">No reconciled ledger activity yet.</span></div>):<div className="empty-state compact-empty"><span className="small">Connect a wallet to view personal activity.</span></div>}</section><section className="card"><div className="row"><div><div className="section-title">Reward index</div><div className="small">Chart visualizes the staking dashboard trend; authoritative claimable value is shown above.</div></div><span className="data-badge">UI trend</span></div><LineChart/></section></div>
      {loading&&<div className="small">Refreshing authoritative account data…</div>}
    </div>

    <aside className="stack"><section className="card"><div className="section-title">Staking options</div>{pools.map((p)=><div className="list-item" key={p.id}><div><b>{p.short}</b><div className="small">{p.lock}</div></div><span className={p.recommended?'badge':'small'}>{p.weight}</span></div>)}<Link href="/stake" className="ghost compact" style={{marginTop:10}}>Compare options <Icons.ChevronRight size={14}/></Link></section><section className="card"><div className="row"><div className="section-title">Network assurance</div><span className="data-badge">Representative aggregate</span></div>{[['184','Active Operators'],['42','Verifiers'],['562M PWRC','Total bonded'],['99.96%','Service availability']].map(([v,l])=><div className="list-item" key={l}><b>{v}</b><span className="small">{l}</span></div>)}<Link href="/network" className="ghost compact" style={{marginTop:10}}>View network <Icons.ChevronRight size={14}/></Link></section><section className="card soft-card"><div className="impact-icon"><Icons.Leaf size={22}/></div><h3>Power real impact.</h3><p className="small">Ordinary staking supports participation and governance; slashable assurance remains explicitly separated into operator and verifier bonds.</p></section></aside>
  </div>;
}
