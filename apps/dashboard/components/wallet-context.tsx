'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authenticateExternalSolanaWallet, injectedProvider } from '@/lib/client/solana-wallet';
import { useRealtime } from '@/hooks/use-realtime';

export type WalletNetwork = 'Solana' | 'Sui';
export type WalletKind = 'embedded' | 'external';

type WalletBalances = { pwrcAtomic?: string; pwrcDecimals?: number; wpwrcAtomic?: string; wpwrcDecimals?: number; sol?: number };
type PublicCapabilities = {
  version: string;
  executionEnabled: boolean;
  embeddedWalletsEnabled: boolean;
  networks: { solana: boolean; sui: boolean };
  bridgeConfigured: boolean;
};

type WalletCtx = {
  connected: boolean;
  embedded: boolean;
  walletKind: WalletKind | null;
  walletName: string | null;
  address: string | null;
  network: WalletNetwork;
  modal: boolean;
  loading: boolean;
  error: string | null;
  balances: WalletBalances | null;
  capabilities: PublicCapabilities | null;
  setModal: (v: boolean) => void;
  setNetwork: (network: WalletNetwork) => void;
  connectExternal: (walletName: string) => Promise<void>;
  startEmbeddedEnrollment: () => Promise<void>;
  refresh: () => Promise<void>;
  disconnect: () => Promise<void>;
};

const Ctx = createContext<WalletCtx | null>(null);
const PROVIDER_KEY = 'powerchain-staking-wallet-provider';

async function parse(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? `Request failed (${response.status})`);
  return data;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [walletKind, setWalletKind] = useState<WalletKind | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetworkState] = useState<WalletNetwork>('Solana');
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [capabilities, setCapabilities] = useState<PublicCapabilities | null>(null);

  const refresh = useCallback(async () => {
    try {
      try {
        const caps = await parse(await fetch('/api/v1/system/capabilities', { cache: 'no-store' })) as PublicCapabilities;
        setCapabilities(caps);
      } catch {
        setCapabilities(null);
      }
      const data = await parse(await fetch('/api/v1/auth/session', { cache: 'no-store' }));
      const session = data.session;
      if (!session) {
        setConnected(false); setWalletKind(null); setAddress(null); setBalances(null); return;
      }
      const kind: WalletKind = session.kind === 'EMBEDDED' ? 'embedded' : 'external';
      setConnected(true); setWalletKind(kind); setAddress(session.wallet); setNetworkState(session.network === 'SUI' ? 'Sui' : 'Solana');
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem(PROVIDER_KEY) : null;
      setWalletName(kind === 'embedded' ? 'PowerChain Wallet' : saved ?? 'External Wallet');
      try { setBalances(await parse(await fetch('/api/v1/wallets/balances', { cache: 'no-store' }))); }
      catch { setBalances(null); }
    } finally { setLoading(false); }
  }, []);

  const onWalletRealtime=useCallback(()=>{void refresh()},[refresh]);
  useRealtime(['wallet.transfer','wallet.balance','staking.position','rewards.claim','bonds.position','swap.intent','bridge.cctp'],onWalletRealtime,connected);

  useEffect(() => { void (async () => {
    try {
      const url = new URL(window.location.href);
      const enrollmentId = url.searchParams.get('embedded_enrollment');
      const token = url.searchParams.get('embedded_session_token');
      if (enrollmentId && token) {
        await parse(await fetch('/api/v1/wallets/embedded/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enrollmentId, sessionToken: token }) }));
        url.searchParams.delete('embedded_enrollment'); url.searchParams.delete('embedded_session_token'); window.history.replaceState({}, '', url.toString());
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Embedded wallet completion failed'); }
    await refresh();
  })(); }, [refresh]);

  const connectExternal = useCallback(async (name: string) => {
    setLoading(true); setError(null);
    try {
      if (network === 'Sui') throw new Error('Sui external-wallet UI requires a Wallet Standard adapter; use the configured embedded wallet or switch to Solana.');
      const result = await authenticateExternalSolanaWallet(name);
      window.localStorage.setItem(PROVIDER_KEY, name);
      setWalletName(name); setAddress(result.wallet); setWalletKind('external'); setConnected(true); setModal(false);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Wallet connection failed'); throw e; }
    finally { setLoading(false); }
  }, [network, refresh]);

  const startEmbeddedEnrollment = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (!capabilities?.embeddedWalletsEnabled) throw new Error('Embedded wallets are not enabled for this deployment.');
      const data = await parse(await fetch('/api/v1/wallets/embedded/enroll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ network: network === 'Sui' ? 'SUI' : 'SOLANA' }) }));
      window.location.assign(data.providerUrl);
    } catch (e) { setError(e instanceof Error ? e.message : 'Embedded wallet enrollment failed'); throw e; }
    finally { setLoading(false); }
  }, [network, capabilities]);

  const disconnect = useCallback(async () => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
      const provider = walletName ? injectedProvider(walletName) : null;
      await provider?.disconnect?.().catch(() => {});
    } finally {
      window.localStorage.removeItem(PROVIDER_KEY); setConnected(false); setWalletKind(null); setWalletName(null); setAddress(null); setBalances(null); setModal(false);
    }
  }, [walletName]);

  const setNetwork = useCallback((next: WalletNetwork) => {
    if (connected) { setError('Disconnect the active wallet before switching networks.'); return; }
    if (next === 'Sui' && capabilities && !capabilities.networks.sui) { setError('Sui is not configured for this deployment.'); return; }
    setError(null); setNetworkState(next);
  }, [connected, capabilities]);

  const value = useMemo<WalletCtx>(() => ({
    connected, embedded: walletKind === 'embedded', walletKind, walletName, address, network, modal, loading, error, balances, capabilities,
    setModal, setNetwork, connectExternal, startEmbeddedEnrollment, refresh, disconnect,
  }), [connected, walletKind, walletName, address, network, modal, loading, error, balances, capabilities, setNetwork, connectExternal, startEmbeddedEnrollment, refresh, disconnect]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useWallet = () => { const c = useContext(Ctx); if (!c) throw new Error('WalletProvider missing'); return c; };
