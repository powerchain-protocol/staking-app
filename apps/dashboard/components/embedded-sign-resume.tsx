'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { pollIntent, resumeEmbeddedIntentFromUrl } from '@/lib/client/execution';
import { useWallet } from './wallet-context';
import { Icons } from './icons';

export function EmbeddedSignResume(){
  const{refresh}=useWallet();const[notice,setNotice]=useState<{title:string;detail:string;done:boolean}|null>(null);
  useEffect(()=>{let active=true;void(async()=>{try{const result=await resumeEmbeddedIntentFromUrl();if(!result||!active)return;window.sessionStorage.setItem('powerchain-last-embedded-submit',JSON.stringify(result));setNotice({title:'Transaction submitted',detail:'Waiting for finalized reconciliation.',done:false});await refresh();const final=await pollIntent(result.kind,result.intentId,undefined,40);if(!active)return;if(final?.status==='RECONCILED'){setNotice({title:'Transaction reconciled',detail:'The action is finalized, posted to the ledger and receipted.',done:true});await refresh();window.setTimeout(()=>active&&setNotice(null),7000);}else if(final?.status==='FAILED'||final?.status==='REQUIRES_REVIEW')setNotice({title:final.status==='FAILED'?'Transaction failed':'Review required',detail:final.error_message??'Open Activity for reconciliation details.',done:true});else setNotice({title:'Transaction submitted',detail:'Final reconciliation continues through the configured worker.',done:false});}catch(e){const message=e instanceof Error?e.message:String(e);window.sessionStorage.setItem('powerchain-last-embedded-error',message);if(active)setNotice({title:'Embedded wallet error',detail:message,done:true});}})();return()=>{active=false};},[refresh]);
  if(!notice)return null;return <div className="global-toast" role="status"><div className="global-toast-icon">{notice.done?<Icons.Check size={18}/>:<Icons.Activity size={18}/>}</div><div><b>{notice.title}</b><div className="small">{notice.detail}</div><Link href="/activity" className="green small">View activity</Link></div><button className="icon-button" aria-label="Dismiss transaction notice" onClick={()=>setNotice(null)}>×</button></div>;
}
