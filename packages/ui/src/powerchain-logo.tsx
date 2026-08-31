import * as React from 'react';

export function PowerChainMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M24 2.8 42.4 13.4v21.2L24 45.2 5.6 34.6V13.4L24 2.8Z" fill="#0a0a0a"/>
      <path d="m24 7.7 5.2 8.8 10.1-1.6-4.7 9.1 4.7 9.1-10.1-1.6-5.2 8.8-5.2-8.8-10.1 1.6 4.7-9.1-4.7-9.1 10.1 1.6L24 7.7Z" fill="#ffffff"/>
      <path d="m24 13.4 3.4 5.8 6.6-1.1-3.1 5.9 3.1 5.9-6.6-1.1-3.4 5.8-3.4-5.8-6.6 1.1 3.1-5.9-3.1-5.9 6.6 1.1 3.4-5.8Z" fill="#0b6b38"/>
      <rect x="20.6" y="20.6" width="6.8" height="6.8" rx="3.4" fill="#ffffff"/>
    </svg>
  );
}

export function PowerChainLogo({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  return (
    <span className={`pc-logo ${className}`.trim()}>
      <PowerChainMark size={compact ? 34 : 40} />
      <span className="pc-logo-copy">
        <span className="pc-logo-name">Power<span>Chain</span></span>
        <span className="pc-logo-sub">Staking</span>
      </span>
    </span>
  );
}
