import { PowerChainLogo } from '@powerchain/ui';
import { LoginForm } from '@/app/login/login-form';

export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}){
  const params=await searchParams;
  return <main className="auth-shell">
    <header className="auth-header"><PowerChainLogo subtitle="Staking"/></header>
    <section className="auth-layout"><div className="auth-copy"><span className="eyebrow">POWERCHAIN STAKING · v1.0.0</span><h2>Stake. Participate. Govern.</h2><p>Secure access to staking positions, rewards, governance, portfolio and cross-chain utilities from one authenticated account.</p><div className="auth-points"><span>Token-2022 PWRC</span><span>Solana mainnet-beta / devnet</span><span>Sui wPWRC</span><span>Non-custodial signing</span></div></div><LoginForm nextPath={params.next}/></section>
  </main>
}
