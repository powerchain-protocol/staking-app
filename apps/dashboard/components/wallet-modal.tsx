'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icons } from './icons';
import { useWallet } from './wallet-context';

type ModalStep = 'choose' | 'embedded';

export function WalletModal() {
  const {
    modal, setModal, network, setNetwork, connectExternal, startEmbeddedEnrollment,
    loading, error, connected, address, walletName, disconnect, capabilities,
  } = useWallet();
  const [step, setStep] = useState<ModalStep>('choose');

  useEffect(() => { if (!modal) setStep('choose'); }, [modal]);
  if (!modal) return null;
  const close = () => setModal(false);

  if (connected) return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="row"><div><div id="wallet-modal-title" className="modal-title">Wallet</div><div className="small">Authenticated PowerChain session</div></div><button className="icon-button" aria-label="Close wallet dialog" onClick={close}>×</button></div>
        <div className="wallet-ready"><span className="success-ring"><Icons.Check size={24}/></span><h3>{walletName ?? 'Connected wallet'}</h3><div className="address-box mono">{address}</div><span className="badge"><span className="dot"/> {network} · {process.env.NEXT_PUBLIC_DEPLOYMENT_TIER === 'devnet' ? 'Devnet' : 'Mainnet Beta'}</span></div>
        <div className="account-links"><Link onClick={close} href="/portfolio">Portfolio</Link><Link onClick={close} href="/accounts">Accounts</Link><Link onClick={close} href="/profiles">Profile</Link><Link onClick={close} href="/settings">Settings</Link></div>
        <div className="modal-actions"><button className="secondary" onClick={close}>Done</button><button className="secondary" onClick={() => void disconnect()}><Icons.LogOut size={15}/>Disconnect</button></div>
      </div>
    </div>
  );

  const embeddedEnabled = Boolean(capabilities?.embeddedWalletsEnabled);
  const suiConfigured = Boolean(capabilities?.networks.sui);

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="row"><div><div id="wallet-modal-title" className="modal-title">{step === 'choose' ? 'Connect to PowerChain' : 'Create PowerChain Wallet'}</div><div className="small" style={{ marginTop: 5 }}>{step === 'choose' ? 'Authenticate a wallet to access staking, rewards and governance.' : 'Embedded wallets use the configured non-custodial signing provider. PowerChain does not receive your private key.'}</div></div><button className="icon-button" aria-label="Close wallet dialog" onClick={close}>×</button></div>
        {error && <div className="security-note" style={{ marginTop: 14 }}><Icons.TriangleAlert size={17}/><div className="small">{error}</div></div>}

        {step === 'choose' && <>
          <div className="field-label" style={{ marginTop: 18 }}>Network</div>
          <div className="segmented" aria-label="Wallet network">
            <button className={network === 'Solana' ? 'active' : ''} onClick={() => setNetwork('Solana')}>Solana</button>
            <button className={network === 'Sui' ? 'active' : ''} disabled={!suiConfigured} title={suiConfigured ? 'Sui configured' : 'Configure SUI_GRPC_URL and WPWRC_COIN_TYPE first'} onClick={() => setNetwork('Sui')}>Sui</button>
          </div>

          {embeddedEnabled ? <>
            <div className="field-label">Recommended</div>
            <button className="wallet-option featured" disabled={loading} onClick={() => setStep('embedded')}>
              <span className="wallet-logo">PC</span><span style={{ flex: 1 }}><b>PowerChain Wallet</b><span className="small" style={{ display: 'block' }}>Embedded · explicit user-presence signing</span></span><span className="badge">Recommended</span><Icons.ChevronRight size={18}/>
            </button>
          </> : <div className="security-note" style={{ marginTop: 16 }}><Icons.ShieldCheck size={17}/><div className="small"><b>Embedded wallet disabled.</b> Configure the provider credentials and set <span className="mono">EMBEDDED_WALLETS_ENABLED=true</span> to expose PowerChain Wallet enrollment.</div></div>}

          <div className="field-label" style={{ marginTop: 14 }}>External wallets</div>
          {['Phantom', 'Solflare', 'Backpack'].map((w) => <button className="wallet-option" disabled={loading || network === 'Sui'} key={w} onClick={() => void connectExternal(w)}><span className="wallet-logo">{w[0]}</span><span style={{ flex: 1 }}><b>{w}</b><span className="small" style={{ display: 'block' }}>{network === 'Sui' ? 'Sui Wallet Standard adapter required' : `${network} wallet`}</span></span><Icons.ChevronRight size={18}/></button>)}
          <div className="security-note"><Icons.ShieldCheck size={17}/><div className="small">Authentication signs a nonce-bound message only. Staking transactions require a separate wallet approval and are reconciled after finality.</div></div>
        </>}

        {step === 'embedded' && <>
          <div className="wallet-create-hero"><div className="wallet-create-icon"><Icons.WalletCards size={28}/></div><b>Non-custodial embedded wallet</b><p className="small">The configured provider creates and signs with user presence. The PowerChain app stores the public wallet link, not a private key.</p></div>
          <div className="checklist">{['No browser extension required', 'Private key is not stored by the PowerChain app server', 'Explicit user presence for signing', 'Provider completion is verified before the wallet session is activated'].map((t) => <div className="check" key={t}><Icons.Check size={15} className="green"/>{t}</div>)}</div>
          <div className="modal-actions"><button className="secondary" onClick={() => setStep('choose')}>Back</button><button className="primary" disabled={loading || !embeddedEnabled} onClick={() => void startEmbeddedEnrollment()}>{loading ? 'Opening provider…' : 'Create wallet'}</button></div>
        </>}
      </div>
    </div>
  );
}
