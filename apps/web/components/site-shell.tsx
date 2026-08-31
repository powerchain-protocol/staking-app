import Link from 'next/link';
import { PowerChainLogo } from '@powerchain/ui';
import { ArrowRight, ShieldCheck, Network, Vote, Gift } from 'lucide-react';

const dashboard=process.env.NEXT_PUBLIC_DASHBOARD_URL??'http://localhost:3001';
export function SiteHeader(){return <header className="site-header"><div className="site-header-inner"><Link href="/"><PowerChainLogo/></Link><nav><Link href="/#product">Product</Link><Link href="/#architecture">Architecture</Link><Link href="/learn">Learn</Link><a href={`${dashboard}/network`}>Network</a></nav><a className="button secondary" href={dashboard}>Open dashboard</a></div></header>}
export function SiteFooter(){return <footer><div className="footer-grid"><div><PowerChainLogo/><p>Stake. Participate. Govern.</p></div><div><b>Product</b><a href={dashboard}>Overview</a><a href={`${dashboard}/stake`}>Stake</a><a href={`${dashboard}/rewards`}>Rewards</a></div><div><b>Governance</b><a href={`${dashboard}/governance`}>Proposals</a><a href={`${dashboard}/network`}>Network</a><Link href="/learn">Guidelines</Link></div><div><b>Legal</b><Link href='/legals/terms'>Terms</Link><Link href='/legals/privacy'>Privacy</Link><Link href='/legals/security'>Security</Link><Link href='/legals/disclosures'>Disclosures</Link></div><div className="footer-copy">© 2026 PowerChain. All rights reserved.</div></div></footer>}
export function FeatureIcon({kind}:{kind:'stake'|'reward'|'govern'|'network'}){const I=kind==='stake'?ShieldCheck:kind==='reward'?Gift:kind==='govern'?Vote:Network;return <span className="feature-icon"><I size={19}/></span>}
export {ArrowRight,dashboard};
