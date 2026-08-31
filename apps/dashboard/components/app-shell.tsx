'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PowerChainLogo } from '@powerchain/ui';
import { Icons } from './icons';
import { WalletProvider, useWallet } from './wallet-context';
import { WalletModal } from './wallet-modal';
import { EmbeddedSignResume } from './embedded-sign-resume';
import { RuntimeBanner } from './runtime-banner';
import { dashboardConfig } from '@/config/system';
import { AccountControl } from '@/components/account-control';
import { useSystemStatus } from '@/hooks/use-system-status';
import { useRealtimeState } from '@/hooks/use-realtime';

const nav = [
  ['/', 'Overview'], ['/copilot', 'Copilot'], ['/stake', 'Stake'], ['/positions', 'Positions'], ['/rewards', 'Rewards'], ['/pwrc', 'PWRC'],
  ['/governance', 'Governance'], ['/network', 'Network'], ['/activity', 'Activity'], ['/learn', 'Learn']
] as const;

const side = [
  ['/', 'Overview', Icons.Home], ['/copilot', 'Copilot', Icons.Sparkles], ['/stake', 'Stake', Icons.Users], ['/positions', 'Positions', Icons.CalendarDays],
  ['/rewards', 'Rewards', Icons.Gift], ['/pwrc', 'PWRC', Icons.Coins], ['/governance', 'Governance', Icons.Vote],
  ['/network', 'Network', Icons.Globe2], ['/activity', 'Activity', Icons.Activity], ['/learn', 'Learn', Icons.BookOpenCheck]
] as const;

const mobile = [
  ['/', 'Overview', Icons.Home], ['/copilot', 'Copilot', Icons.Sparkles], ['/stake', 'Stake', Icons.Plus], ['/positions', 'Positions', Icons.CalendarDays],
  ['/rewards', 'Rewards', Icons.Gift], ['/pwrc', 'PWRC', Icons.Coins]
] as const;

function isActive(path: string, href: string) { return path === href || (href !== '/' && path.startsWith(href)); }
function formatAtomic(value: string | undefined, decimals = 9, compact = false) {
  if (!value) return '0';
  const atomic = BigInt(value); const scale = 10n ** BigInt(decimals); const whole = atomic / scale; const frac = atomic % scale;
  if (compact && whole >= 1_000_000n) return `${(Number(whole) / 1_000_000).toFixed(2)}M`;
  const fraction = frac.toString().padStart(decimals, '0').replace(/0+$/, '').slice(0, 4);
  return `${whole.toLocaleString()}${fraction ? `.${fraction}` : ''}`;
}
function shortAddress(value: string | null) { return value && value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value ?? ''; }

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const networkLabel = process.env.NEXT_PUBLIC_NETWORK_LABEL ?? (process.env.NEXT_PUBLIC_DEPLOYMENT_TIER === 'devnet' ? 'Devnet' : 'Mainnet Beta');
  const overview = path === '/';
  const { connected, embedded, walletName, address, network, balances, setModal, disconnect } = useWallet();
  const tokenAtomic = network === 'Solana' ? balances?.pwrcAtomic : balances?.wpwrcAtomic;
  const tokenDecimals = network === 'Solana' ? balances?.pwrcDecimals ?? 9 : balances?.wpwrcDecimals ?? 9;
  const tokenSymbol = network === 'Solana' ? 'PWRC' : 'wPWRC';

  return <div className="shell">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand" aria-label="PowerChain Staking home"><PowerChainLogo /></Link>
        <nav className="nav" aria-label="Primary navigation">
          {nav.map(([href, label]) => <Link key={href} href={href} className={isActive(path, href) ? 'active' : ''}>{label}</Link>)}
        </nav>
        <div className="top-actions">
          <AccountControl/>
          <div className="chip status-chip"><span className="dot" />{networkLabel}</div>
          {connected && <div className="chip mono desktop-balance">{formatAtomic(tokenAtomic, tokenDecimals, true)} {tokenSymbol}</div>}
          <button className={`wallet-btn ${connected ? 'wallet-btn-connected' : 'wallet-btn-connect'}`} onClick={() => setModal(true)} aria-label={connected ? 'Open wallet options' : 'Connect wallet'}>
            {connected ? <><span className="avatar mini">{embedded ? 'PC' : 'W'}</span><span className="wallet-label">{shortAddress(address)}</span><Icons.ChevronDown size={14} /></> : <>Connect wallet</>}
          </button>
        </div>
      </div>
    </header>

    <RuntimeBanner />

    <div className={`app-grid ${overview ? 'overview-grid' : ''}`}>
      {!overview && <aside className="sidebar">
        {connected ? <div className="wallet-card">
          <div className="wallet-row">
            <div className="avatar">{embedded ? 'PC' : 'W'}</div>
            <div className="wallet-copy"><div className="wallet-name">{walletName ?? 'PowerChain Wallet'}</div><div className="small mono">{shortAddress(address)} <span aria-hidden="true">⧉</span></div></div>
            <Icons.ChevronDown size={14} className="wallet-chevron" />
          </div>
          <div className="wallet-bal mono">{formatAtomic(tokenAtomic, tokenDecimals)} <span>{tokenSymbol}</span></div>
          <div className="small">Live wallet balance · {network}</div>
          <div className="sidebar-wallet-actions"><Link href="/pwrc" className="secondary compact">Wallet</Link><button className="ghost compact" onClick={disconnect}><Icons.LogOut size={14} />Disconnect</button></div>
        </div> : <button className="wallet-card wallet-card-connect" onClick={() => setModal(true)}>
          <div className="wallet-create-icon"><Icons.WalletCards size={22} /></div><b>Connect a wallet</b><span className="small">Access PWRC, positions, rewards and governance.</span><span className="green">Connect →</span>
        </button>}

        <nav className="side-nav" aria-label="Section navigation">
          {side.map(([href, label, Icon]) => <Link key={href} href={href} className={isActive(path, href) ? 'active' : ''}><Icon size={17} />{label}</Link>)}
        </nav>

        <div className="impact-card">
          <div className="impact-icon"><Icons.Leaf size={24} /></div>
          <h3>{path.startsWith('/governance') ? 'Your voice shapes PowerChain.' : path.startsWith('/rewards') ? 'Every action powers real impact.' : 'Power real impact.'}</h3>
          <p className="small">PWRC participation supports renewable infrastructure, governance, operators and verified network services.</p>
          <Link href="/learn" className="ghost compact">Learn more <Icons.ArrowUpRight size={13} /></Link>
        </div>
        <div className="sidebar-help"><span className="small">Need help?</span><Link href="/learn" className="green">Visit Help Center <Icons.ExternalLink size={12}/></Link></div>
      </aside>}

      <main id="main-content" className={`main ${overview ? 'main-overview' : ''}`}>{children}</main>
    </div>

    <nav className="mobile-nav" aria-label="Mobile navigation">
      {mobile.map(([href, label, Icon]) => <Link key={href} href={href} className={isActive(path, href) ? 'active' : ''}><Icon size={19} /><span>{label}</span></Link>)}
    </nav>

    <Footer />
    <WalletModal />
    <EmbeddedSignResume />
  </div>;
}

function RuntimeStatus(){
  const health=useSystemStatus();const realtimeState=useRealtimeState();const ok=Boolean(health.data?.ok||health.data?.healthy);
  const runtimeLabel=!ok&&health.error?'Runtime unavailable':!ok?'Degraded runtime':health.data?.executionEnabled?'Execution enabled':'Read-only runtime';
  const liveLabel=realtimeState==='open'?'Live':realtimeState==='reconnecting'||realtimeState==='connecting'?'Live reconnecting':'Live idle';
  return <div className={'footer-status '+(ok?'':'footer-status-warn')}><span className="dot" />{runtimeLabel}<span aria-hidden="true"> · </span>{liveLabel}</div>;
}

function Footer() {
  const groups = [
    ['PRODUCT', [['Overview', '/'], ['Copilot', '/copilot'], ['Stake', '/stake'], ['Positions', '/positions'], ['Rewards', '/rewards'], ['PWRC', '/pwrc']]],
    ['GOVERNANCE', [['Active Proposals', '/governance'], ['Delegations', '/governance'], ['Voting Power', '/governance'], ['Guidelines', '/learn']]],
    ['NETWORK', [['Operators', '/network'], ['Verifiers', '/network'], ['Bonds', '/network'], ['Network Status', '/network'], ['Bridge', '/bridge']]],
    ['RESOURCES', [['Docs', '/learn'], ['Help Center', '/learn'], ['Learn', '/learn'], ['FAQ', '/learn']]],
    ['LEGAL', [['Terms of Service', '/legals/terms'], ['Privacy Policy', '/legals/privacy'], ['Security', '/legals/security'], ['Disclosures', '/legals/disclosures']]]
  ] as const;

  return <footer className="footer"><div className="footer-inner">
    <div className="footer-intro"><PowerChainLogo /><p>Stake. Participate. Govern.</p><RuntimeStatus /></div>
    {groups.map(([h, items]) => <div className="footer-group" key={h}><h4>{h}</h4>{items.map(([label, href]) => <Link href={href} key={label}>{label}</Link>)}</div>)}
    {dashboardConfig.socialLinks.length ? <div className="footer-social"><b>Stay connected</b><div className="footer-social-icons">{dashboardConfig.socialLinks.map(([label,href]) => <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label}>{label==='GitHub'?<Icons.Github size={18}/>:label==='Discord'?<Icons.MessageCircle size={18}/>:label==='Telegram'?<Icons.Send size={18}/>:<span>𝕏</span>}</a>)}</div></div> : null}
    <div className="footer-bottom">© 2026 PowerChain. All rights reserved.</div>
  </div></footer>;
}

export function AppShell({ children }: { children: React.ReactNode }) { return <WalletProvider><Shell>{children}</Shell></WalletProvider>; }
