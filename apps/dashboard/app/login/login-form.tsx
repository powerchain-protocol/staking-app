'use client';
import { SignIn, useAuth, UserButton } from '@clerk/nextjs';
import { useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icons } from '@/components/icons';
import { useWallet } from '@/components/wallet-context';
import { safeNextPath } from '@/redirects';
import { Message } from '@/components/messages';
import { Information } from '@/components/informations';
import { Field } from '@/components/ui/forms';
import { emitUiEvent } from '@/lib/events';
import { betterAuthClient, betterAuthSocialProviders } from '@/lib/auth/better-auth-client';

const authMode=process.env.NEXT_PUBLIC_AUTH_PROVIDER??'clerk';

function WalletVerification({next,accountControl}:{next:string;accountControl?:React.ReactNode}){
  const router=useRouter();const wallet=useWallet();const[busy,setBusy]=useState<string|null>(null);
  useEffect(()=>{if(wallet.connected)router.replace(next)},[wallet.connected,router,next]);
  async function connect(name:string){setBusy(name);try{await wallet.connectExternal(name);emitUiEvent({type:'auth',level:'success',title:'Wallet verified',message:'Your signed-in account is now bound to this wallet.'});router.replace(next)}catch(e){emitUiEvent({type:'auth',level:'error',title:'Wallet verification failed',message:e instanceof Error?e.message:'Unable to verify wallet'})}finally{setBusy(null)}}
  async function embedded(){setBusy('embedded');try{await wallet.startEmbeddedEnrollment();emitUiEvent({type:'auth',level:'info',title:'Embedded wallet enrollment started'})}catch(e){emitUiEvent({type:'auth',level:'error',title:'Embedded wallet unavailable',message:e instanceof Error?e.message:'Unable to start enrollment'})}finally{setBusy(null)}}
  return <div className="login-card"><div className="row"><div><div className="login-mark"><Icons.ShieldCheck/></div><h1>Verify your wallet</h1></div>{accountControl}</div><p>Your account is signed in. Verify a wallet before loading private balances or signing chain actions.</p><div className="login-wallet-list">{['Phantom','Solflare','Backpack'].map(name=><button className="wallet-login-button" disabled={wallet.loading||busy!==null} key={name} onClick={()=>void connect(name)}><span className="wallet-login-icon">{name.slice(0,1)}</span><span><strong>{name}</strong><small>Solana wallet ownership proof</small></span><Icons.ChevronRight/></button>)}{wallet.capabilities?.embeddedWalletsEnabled?<button className="wallet-login-button recommended" disabled={wallet.loading||busy!==null} onClick={()=>void embedded()}><span className="wallet-login-icon">PC</span><span><strong>PowerChain Wallet</strong><small>Embedded non-custodial wallet</small></span><Icons.ChevronRight/></button>:null}</div>{wallet.error?<Message title="Wallet verification failed" tone="error">{wallet.error}</Message>:null}<Message title="Three independent security boundaries" tone="success">Account authentication proves identity. Wallet challenge signatures prove address control. Transaction signatures authorize individual blockchain actions.</Message></div>;
}

function ClerkLogin({next}:{next:string}){
  const auth=useAuth();
  if(!auth.isLoaded)return <div className="login-card"><div className="skeleton-line"/></div>;
  if(!auth.isSignedIn)return <div className="login-card clerk-login-card"><div className="login-mark"><Icons.ShieldCheck/></div><h1>Sign in to PowerChain</h1><p>Account authentication is handled by Clerk. Enabled social providers appear automatically below.</p><SignIn routing="path" path="/login" fallbackRedirectUrl={`/login?wallet=1&next=${encodeURIComponent(next)}`} signUpFallbackRedirectUrl={`/login?wallet=1&next=${encodeURIComponent(next)}`}/><Information>Social sign-in authenticates your PowerChain account. It never grants blockchain spending permission.</Information></div>;
  return <WalletVerification next={next} accountControl={<UserButton/>}/>;
}

function BetterAuthLogin({next}:{next:string}){
  const session=betterAuthClient.useSession();const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[name,setName]=useState('');const[mode,setMode]=useState<'signin'|'signup'>('signin');const[busy,setBusy]=useState(false);const[error,setError]=useState('');
  if(session.isPending)return <div className="login-card"><div className="skeleton-line"/></div>;
  if(session.data?.user)return <WalletVerification next={next} accountControl={<button className="secondary compact" onClick={()=>void betterAuthClient.signOut()}>Sign out</button>}/>;
  async function emailAuth(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const result:any=mode==='signin'?await betterAuthClient.signIn.email({email,password}):await betterAuthClient.signUp.email({email,password,name:name||email.split('@')[0]});if(result?.error)throw new Error(result.error.message||'Authentication failed');emitUiEvent({type:'auth',level:'success',title:mode==='signin'?'Signed in':'Account created',message:mode==='signup'?'Check your email if verification is required.':'Continue with wallet verification.'})}catch(e){setError(e instanceof Error?e.message:'Authentication failed')}finally{setBusy(false)}}
  async function social(provider:'google'|'github'|'apple'){setBusy(true);setError('');try{const result:any=await betterAuthClient.signIn.social({provider,callbackURL:`/login?wallet=1&next=${encodeURIComponent(next)}`});if(result?.error)throw new Error(result.error.message||'Social sign-in failed')}catch(e){setError(e instanceof Error?e.message:'Social sign-in failed');setBusy(false)}}
  return <div className="login-card"><div className="login-mark"><Icons.ShieldCheck/></div><h1>{mode==='signin'?'Sign in to PowerChain':'Create PowerChain account'}</h1><p>Better Auth is the selected account provider for this deployment.</p><form className="form-grid single" onSubmit={emailAuth}>{mode==='signup'?<Field label="Name"><input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required/></Field>:null}<Field label="Email"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required/></Field><Field label="Password" hint="Use at least 8 characters."><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='signin'?'current-password':'new-password'} minLength={8} required/></Field><button className="primary" type="submit" disabled={busy}>{busy?'Please wait…':mode==='signin'?'Sign in':'Create account'}</button></form>{betterAuthSocialProviders.length?<div className="login-wallet-list">{betterAuthSocialProviders.map(provider=><button key={provider} className="wallet-login-button" disabled={busy} onClick={()=>void social(provider)}><span className="wallet-login-icon">{provider[0].toUpperCase()}</span><span><strong>Continue with {provider[0].toUpperCase()+provider.slice(1)}</strong><small>Social account authentication</small></span><Icons.ChevronRight/></button>)}</div>:null}<button className="secondary" onClick={()=>setMode(mode==='signin'?'signup':'signin')}>{mode==='signin'?'Create an account':'Already have an account?'}</button>{error?<Message title="Authentication failed" tone="error">{error}</Message>:null}<Information>Account authentication never authorizes a transfer, stake, vote, bridge or claim. Wallet and transaction signatures remain separate.</Information></div>;
}

export function LoginForm({nextPath='/'}:{nextPath?:string}){const next=safeNextPath(nextPath);return authMode==='better-auth'?<BetterAuthLogin next={next}/>:<ClerkLogin next={next}/>}
