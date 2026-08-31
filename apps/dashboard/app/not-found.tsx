import Link from 'next/link';
import { Icons } from '@/components/icons';
export default function NotFound(){return <div className="page-wrap single-column"><section className="card error-state"><div className="impact-icon"><Icons.HelpCircle size={24}/></div><div className="small green eyebrow">404 · POWERCHAIN STAKING</div><h1>Page not found</h1><p className="page-sub">The requested staking surface does not exist or has moved.</p><Link href="/" className="primary">Return to overview</Link></section></div>}
