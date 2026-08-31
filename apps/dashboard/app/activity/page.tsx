'use client';

import { useMemo, useState } from 'react';
import { txs } from '@/lib/data';
import { Icons } from '@/components/icons';

type Filter = 'All' | 'Staking' | 'Rewards' | 'Governance' | 'Bonds';

export default function Activity() {
  const [filter, setFilter] = useState<Filter>('All');
  const rows = useMemo(() => txs.filter((t) => {
    if (filter === 'All') return true;
    if (filter === 'Staking') return t.type === 'Stake';
    if (filter === 'Rewards') return t.type === 'Reward' || t.type === 'Receive';
    if (filter === 'Governance') return t.type === 'Governance';
    if (filter === 'Bonds') return t.type === 'Bond';
    return true;
  }), [filter]);

  return <div className="page-wrap full"><div className="stack"><div className="page-heading-row"><div><h1 className="page-title">Activity</h1><div className="page-sub">Staking, rewards, governance and PWRC events with reconciliation status.</div></div><span className="data-badge">Representative history</span></div><section className="card"><div className="tabs scroll-tabs">{(['All', 'Staking', 'Rewards', 'Governance', 'Bonds'] as Filter[]).map((x) => <button className={'tab ' + (filter === x ? 'active' : '')} key={x} onClick={() => setFilter(x)}>{x}</button>)}</div><div className="table-scroll"><table className="table"><thead><tr><th>Type</th><th>Amount / Action</th><th>From / To</th><th>Transaction</th><th>Time</th><th>Status</th></tr></thead><tbody>{rows.map((t) => <tr key={t.tx}><td><b>{t.type}</b></td><td><b className={t.amount.startsWith('+') ? 'green mono' : 'mono'}>{t.amount}</b></td><td>{t.from}</td><td className="mono">{t.tx}</td><td>{t.time}</td><td><span className={'badge ' + (t.status === 'Pending' ? 'warn' : '')}><Icons.BadgeCheck size={12} />{t.status}</span></td></tr>)}</tbody></table></div>{!rows.length && <div className="empty-state"><Icons.Activity size={24} /><b>No activity in this filter</b></div>}</section></div></div>;
}
