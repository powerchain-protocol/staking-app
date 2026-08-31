import 'server-only';
import { env } from '@/lib/server/config';
import { powerchainEmailTemplate } from './email-template';
export type MailInput={to:string;subject:string;html:string};
function validEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=320}
export async function sendEmail(input:MailInput){
  if(!env.mailEnabled)return {sent:false,reason:'MAIL_DISABLED'};
  if(!validEmail(input.to))throw new Error('Invalid recipient email');
  if(!env.mailFrom||!env.resendApiKey)throw new Error('Mail is enabled but MAIL_FROM or RESEND_API_KEY is missing');
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.resendApiKey}`,'content-type':'application/json'},body:JSON.stringify({from:env.mailFrom,to:[input.to],subject:input.subject.slice(0,200),html:input.html}),cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error(`Mail provider rejected request (${r.status})`);return {sent:true,response:await r.json()};
}
export async function sendWelcomeEmail(to:string,name?:string|null){return sendEmail({to,subject:'Welcome to PowerChain',html:powerchainEmailTemplate({title:`Welcome${name?`, ${name}`:''}`,preheader:'Your PowerChain account is ready.',bodyHtml:'<p>Your PowerChain account is ready. Wallet verification and blockchain transaction approval remain separate security steps.</p>'})});}
export async function sendVerificationEmail(to:string,url:string){return sendEmail({to,subject:'Verify your PowerChain account',html:powerchainEmailTemplate({title:'Verify your PowerChain account',preheader:'Confirm your email address to continue.',bodyHtml:'<p>Confirm your email address to activate this account identity. This does not connect or authorize a blockchain wallet.</p>',cta:{label:'Verify email',url}})});}
