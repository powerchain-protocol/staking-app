'use client';

import { useMemo, useState } from 'react';
import { pools, PWRC_REFERENCE_PRICE_USD } from '@/lib/data';
import { Icons } from '@/components/icons';
import { useWallet } from '@/components/wallet-context';
import { createIntent, executePreparedSolanaIntent, pollStakingIntent } from '@/lib/client/execution';
import { atomicToNumber, formatAtomic, parsePwrc } from '@/lib/client/pwrc';

function formatDate(days: number | null) {
  if (days === null) return 'Configured cooldown after unstake request';
  const d = new Date(); d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

function shortAddress(value: string | null) { return value ? `${value.slice(0, 4)}…${value.slice(-4)}` : '—'; }

type ExecutionState = { stage: string; detail?: string; signature?: string; error?: string } | null;

export default function Stake() {
  const [amount, setAmount] = useState('');
  const [poolId, setPoolId] = useState('90');
  const [review, setReview] = useState(false);
  const [execution, setExecution] = useState<ExecutionState>(null);
  const wallet = useWallet();
  const pool = useMemo(() => pools.find((x) => x.id === poolId) ?? pools[2], [poolId]);
  const decimals = wallet.balances?.pwrcDecimals ?? 9;
  const availableAtomic = BigInt(wallet.balances?.pwrcAtomic ?? '0');
  const available = atomicToNumber(availableAtomic, decimals);
  let amountAtomic = 0n; let amountError: string | null = null;
  try { if (amount) amountAtomic = parsePwrc(amount, decimals); } catch (e) { amountError = e instanceof Error ? e.message : 'Invalid amount'; }
  const invalidAmount = !amount || amountAtomic <= 0n || amountAtomic > availableAtomic || !!amountError;
  const numericAmount = atomicToNumber(amountAtomic, decimals);
  const termDays = pool.lockDays ?? 30;
  const estimatedRewards = Math.round(numericAmount * (pool.rateValue / 100) * termDays / 365);
  const unlock = formatDate(pool.lockDays);

  const setPercent = (pct: number) => {
    const atomic = availableAtomic * BigInt(pct) / 100n;
    setAmount(formatAtomic(atomic, decimals, Math.min(decimals, 4)).replace(/,/g, ''));
  };

  const execute = async () => {
    if (!wallet.connected || !wallet.walletKind) { wallet.setModal(true); return; }
    if (wallet.network !== 'Solana') { setExecution({ stage: 'Blocked', error: 'PWRC staking execution is currently configured for Solana.' }); return; }
    try {
      setExecution({ stage: 'Creating intent', detail: 'Server is validating policy and authoritative chain configuration.' });
      const created = await createIntent('staking', { action: 'STAKE', poolId, amountAtomic: amountAtomic.toString() });
      const intentId = created.intent.id as string;
      setExecution({ stage: 'Wallet approval', detail: 'The exact server-prepared transaction will be shown in your wallet.' });
      const submitted = await executePreparedSolanaIntent({ kind: 'staking', intentId, walletKind: wallet.walletKind, walletName: wallet.walletName });
      if (submitted.status === 'AWAITING_EMBEDDED_WALLET') return;
      setExecution({ stage: 'Submitted', detail: 'Waiting for Solana finality and PowerChain reconciliation.', signature: submitted.signature });
      const final = await pollStakingIntent(intentId, (intent) => setExecution({ stage: intent.status, detail: 'Chain finality and internal ledger reconciliation are being verified.', signature: intent.submitted_signature ?? submitted.signature }));
      if (!final) setExecution({ stage: 'Confirming', detail: 'The transaction remains pending. You can safely revisit Positions later.', signature: submitted.signature });
      else if (final.status === 'RECONCILED') { await wallet.refresh(); setReview(false); setAmount(''); setExecution({ stage: 'Reconciled', detail: 'Position, ledger entries and immutable receipt are complete.', signature: final.submitted_signature }); }
      else setExecution({ stage: final.status, detail: final.error_message ?? 'The transaction requires review.', signature: final.submitted_signature, error: final.error_message ?? undefined });
    } catch (e) {
      setExecution({ stage: 'Failed', error: e instanceof Error ? e.message : 'Staking execution failed.' });
    }
  };

  return <div className="page-wrap">
    <div className="stack">
      <div className="page-heading-row"><div><h1 className="page-title">Stake PWRC</h1><div className="page-sub">Create a policy-bound staking intent, approve the exact transaction in your wallet, then wait for finality and reconciliation.</div></div><span className="data-badge">Canonical v1.0.0</span></div>

      <div className="flow-steps" aria-label="Staking steps">{['Amount & option', 'Review', 'Wallet approval', 'Reconcile'].map((label, i) => <div className={execution ? (i < 3 ? 'active' : '') : i === 0 ? 'active' : ''} key={label}><span>{i + 1}</span>{label}</div>)}</div>

      <section className="card">
        <div className="row"><b>1. Amount</b><span className="small">{wallet.connected ? `Authenticated · ${shortAddress(wallet.address)}` : 'Wallet authentication required'}</span></div>
        <div className="stake-amount-grid">
          <div className="balance-panel"><div className="small">Available wallet balance</div><div className="metric mono">{wallet.connected ? formatAtomic(availableAtomic, decimals) : '—'} <span>PWRC</span></div><div className="small">{wallet.connected ? `≈ $${(available * PWRC_REFERENCE_PRICE_USD).toFixed(2)} USD reference` : 'Connect to load Token-2022 balance'}</div></div>
          <div><label className="field-label" htmlFor="stake-amount">Stake amount</label><div className={'amount-input ' + (invalidAmount && amount ? 'invalid' : '')}><input id="stake-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" /><b>PWRC</b></div><div className={amountError || amountAtomic > availableAtomic ? 'field-error' : 'small'} style={{ marginTop: 7 }}>{amountError ?? (amountAtomic > availableAtomic ? 'Amount exceeds the authenticated wallet balance.' : `≈ $${(numericAmount * PWRC_REFERENCE_PRICE_USD).toFixed(2)} USD reference`)}</div><div className="percent-row">{[25, 50, 75, 100].map((x) => <button key={x} disabled={!wallet.connected || availableAtomic <= 0n} onClick={() => setPercent(x)}>{x === 100 ? 'MAX' : `${x}%`}</button>)}</div></div>
        </div>
        <div className="divider" />
        <div className="row"><div><b>2. Choose staking option</b><div className="small" style={{ marginTop: 5 }}>Pool terms are included in the server quote; displayed rates remain estimates until funded epoch policy is evaluated.</div></div><span className="small">5 policies</span></div>
        <div className="stack pool-list">{pools.map((x) => <button key={x.id} className={'pool ' + (poolId === x.id ? 'selected' : '')} onClick={() => setPoolId(x.id)} aria-pressed={poolId === x.id}><span className="radio" /><div className="pool-main"><div><b>{x.name}</b>{x.recommended && <span className="badge">Recommended</span>}</div><span className="small">{x.lock}{x.id === 'flex' ? ' · policy cooldown' : ''}</span></div><div className="pool-stat"><b>{x.weight}</b><span>Governance</span></div><div className="pool-stat"><b>Est. {x.rate}</b><span>Illustrative rate</span></div><div className="pool-stat"><span>{x.lockDays ? 'Earliest unlock' : 'Withdrawal'}</span><b>{formatDate(x.lockDays)}</b></div></button>)}</div>
        <div className="security-note"><Icons.ShieldCheck size={18} /><div><b>Authoritative execution is fail-closed.</b><div className="small">The server validates the configured Token-2022 PWRC mint, RPC, staking program, transaction message, wallet signature and final chain state. Standard staking is not slashable service collateral.</div></div></div>
      </section>
    </div>

    <aside className="stack"><section className="card summary-card"><div className="row"><div className="section-title">Staking summary</div><span className="badge">{pool.short}</span></div>{[['You will stake', `${numericAmount.toLocaleString(undefined,{maximumFractionDigits:4})} PWRC`], ['USD reference', `≈ $${(numericAmount * PWRC_REFERENCE_PRICE_USD).toFixed(2)}`], ['Governance multiplier', pool.weight], ['Illustrative reward rate', `Est. ${pool.rate}`], [`Illustrative rewards / ${termDays}d`, `${estimatedRewards.toLocaleString()} PWRC`], ['Earliest unlock', unlock]].map(([a,b]) => <div className="summary-item" key={a}><span className="small">{a}</span><b>{b}</b></div>)}<div className="summary-item"><span className="small">Network</span><b>{wallet.network} {wallet.network === 'Solana' ? '· configured cluster' : ''}</b></div><div className="summary-item"><span className="small">Wallet</span><b className="mono">{shortAddress(wallet.address)}</b></div><button className="primary" disabled={wallet.connected && invalidAmount} style={{ width: '100%', marginTop: 16 }} onClick={() => wallet.connected ? setReview(true) : wallet.setModal(true)}>{wallet.connected ? <>Review staking <Icons.ArrowUpRight size={16} /></> : <>Connect wallet to continue</>}</button><div className="small center-note"><Icons.LockKeyhole size={13} /> Wallet connection, account authentication and transaction approval are separate steps.</div></section></aside>

    {review && <div className="modal-backdrop" onMouseDown={() => !execution && setReview(false)}><div className="modal review-modal" role="dialog" aria-modal="true" aria-labelledby="stake-review-title" onMouseDown={(e) => e.stopPropagation()}><div className="row"><div><div id="stake-review-title" className="modal-title">Review staking</div><div className="small">Server-side intent creation occurs only after you confirm.</div></div><button className="icon-button" onClick={() => setReview(false)} disabled={!!execution && !['Failed','Reconciled','REQUIRES_REVIEW'].includes(execution.stage)} aria-label="Close review">×</button></div><div className="review-amount"><span className="small">You are staking</span><div className="metric-lg mono">{numericAmount.toLocaleString(undefined,{maximumFractionDigits:4})} <span>PWRC</span></div><span className="small">From {wallet.walletName ?? 'authenticated wallet'} · {shortAddress(wallet.address)}</span></div>{[['Network', 'Solana · configured cluster'], ['Pool', pool.name], ['Earliest unlock', unlock], ['Reward model', 'Funded epoch index · displayed rate is illustrative'], ['Governance multiplier', pool.weight], ['PWRC precision', `${decimals} decimals · Token-2022 validated server-side`]].map(([a,b]) => <div className="summary-item" key={a}><span className="small">{a}</span><b>{b}</b></div>)}{execution ? <div className="security-note"><Icons.Activity size={17} /><div><b>{execution.stage}</b><div className="small">{execution.error ?? execution.detail}</div>{execution.signature && <div className="small mono" style={{ marginTop: 4 }}>{execution.signature}</div>}</div></div> : <div className="security-note"><Icons.ShieldCheck size={17} /><div className="small"><b>No client-supplied reward or settlement state is trusted.</b> The prepared transaction is hash-locked before signing and completion requires finalized state, ledger posting and an immutable receipt.</div></div>}<button className="primary full-button" disabled={!!execution && !['Failed','REQUIRES_REVIEW'].includes(execution.stage)} onClick={execute}>{execution ? (execution.stage === 'Failed' || execution.stage === 'REQUIRES_REVIEW' ? 'Retry' : execution.stage === 'Reconciled' ? 'Completed' : 'Processing…') : wallet.embedded ? 'Confirm with PowerChain Wallet' : `Review in ${wallet.walletName ?? 'wallet'}`}</button></div></div>}
  </div>;
}
