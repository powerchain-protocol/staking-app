'use client';
export function ProviderBadge({provider}:{provider:string}){return <span className="ai-provider-badge">{provider||'provider'}</span>}
export function EvidenceBadge({certainty}:{certainty:string}){return <span className={`ai-certainty ${certainty.toLowerCase()}`}>{certainty}</span>}
