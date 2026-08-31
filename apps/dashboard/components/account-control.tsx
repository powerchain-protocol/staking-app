'use client';
import Link from 'next/link';
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import { betterAuthClient } from '@/lib/auth/better-auth-client';

const mode = process.env.NEXT_PUBLIC_AUTH_PROVIDER ?? 'clerk';

function BetterAuthAccountControl(){
  const session = betterAuthClient.useSession();
  if (session.isPending) return <span className="small">Checking account…</span>;
  if (!session.data?.user) return <Link className="secondary compact" href="/login">Sign in</Link>;
  const name = session.data.user.name || session.data.user.email || 'Account';
  return <button className="secondary compact" onClick={() => void betterAuthClient.signOut()} title={name}>Sign out</button>;
}

export function AccountControl(){
  if(mode === 'better-auth') return <BetterAuthAccountControl/>;
  return <><SignedOut><Link className="secondary compact" href="/login">Sign in</Link></SignedOut><SignedIn><UserButton/></SignedIn></>;
}
