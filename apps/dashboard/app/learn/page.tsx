import Link from 'next/link';
import { Icons } from '@/components/icons';

const topics = [
  ['Staking', 'Flexible and fixed-lock PWRC participation, funded rewards, position lifecycle and reconciliation.', '/stake', Icons.Coins],
  ['Rewards', 'How funded reward epochs, cumulative indexes, vault coverage and immutable claim receipts work.', '/rewards', Icons.Gift],
  ['Governance', 'Voting weight, proposals, quorum, execution timelocks and wallet-approved governance actions.', '/governance', Icons.Vote],
  ['Network', 'Operators, verifiers, service bonds, Token-2022 validation and PWRC/wPWRC reserve assurance.', '/network', Icons.Globe2],
  ['Wallet & PWRC', 'Wallet authentication, embedded-wallet boundaries, Token-2022 transfers and account safety.', '/pwrc', Icons.WalletCards],
  ['Security', 'Fail-closed readiness, reconciliation, double-entry ledger, immutable receipts and circuit breakers.', '/network', Icons.ShieldCheck],
] as const;

export default function Learn(){
  return <div className="page-wrap"><div className="stack"><div className="page-heading-row"><div><h1 className="page-title">Learn</h1><div className="page-sub">PowerChain Staking product, protocol and operational guidance.</div></div><span className="badge"><span className="dot"/>v1.0.0</span></div>
    <section className="card"><div className="section-title">Start here</div><div className="learn-grid">{topics.map(([title,copy,href,Icon])=><Link href={href} className="learn-card" key={title}><div className="iconbox"><Icon size={17}/></div><b>{title}</b><p className="small">{copy}</p><span className="green">Open guide <Icons.ChevronRight size={13}/></span></Link>)}</div></section>
    <section className="card"><div className="section-title">Execution model</div><div className="governance-flow"><div><span>1</span><b>Understand</b><small>Read policy and authoritative account state.</small></div><div><span>2</span><b>Review</b><small>Backend creates an immutable execution intent.</small></div><div><span>3</span><b>Approve</b><small>Your wallet signs the exact prepared message.</small></div><div><span>4</span><b>Finalize</b><small>Chain finality is verified before state promotion.</small></div><div><span>5</span><b>Reconcile</b><small>Ledger, receipt and indexed state are completed.</small></div></div></section>
  </div><aside className="stack"><section className="card"><div className="section-title">Safety principles</div>{['No reward without funded source','No settlement without verified event','No bridge representation without reserve coverage','No service slash without policy, evidence and review','No UI success state before backend reconciliation'].map(x=><div className="list-item" key={x}><span>{x}</span><Icons.CircleCheck size={15} className="green"/></div>)}</section><section className="card"><div className="section-title">Need help?</div><p className="small">Use the immutable request ID shown with API errors when contacting an operator or auditor.</p><Link href="/activity" className="secondary full-button">View account activity</Link></section></aside></div>
}
