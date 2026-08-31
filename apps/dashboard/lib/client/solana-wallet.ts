'use client';

import { Transaction, VersionedTransaction } from '@solana/web3.js';

export type InjectedSolanaProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: { toString(): string } | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect?(): Promise<void>;
  signMessage(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array } | Uint8Array>;
  signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
};

declare global {
  interface Window {
    phantom?: { solana?: InjectedSolanaProvider };
    solflare?: InjectedSolanaProvider;
    backpack?: { solana?: InjectedSolanaProvider };
    solana?: InjectedSolanaProvider;
  }
}

const ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(source: Uint8Array) {
  if (source.length===0) return '';
  const digits=[0];
  for (const byte of source) {
    let carry=byte;
    for(let j=0;j<digits.length;j++){const x=digits[j]*256+carry;digits[j]=x%58;carry=Math.floor(x/58);}
    while(carry){digits.push(carry%58);carry=Math.floor(carry/58);}
  }
  let out='';
  for(let k=0;k<source.length-1&&source[k]===0;k++)out+='1';
  for(let q=digits.length-1;q>=0;q--)out+=ALPHABET[digits[q]];
  return out;
}

function bytesFromBase64(value:string){const binary=atob(value);const out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;}
function base64FromBytes(value:Uint8Array){let binary='';for(let i=0;i<value.length;i++)binary+=String.fromCharCode(value[i]);return btoa(binary);}

export function injectedProvider(name:string):InjectedSolanaProvider|null{
  if(name==='Phantom') return window.phantom?.solana??(window.solana?.isPhantom?window.solana:null);
  if(name==='Solflare') return window.solflare??(window.solana?.isSolflare?window.solana:null);
  if(name==='Backpack') return window.backpack?.solana??null;
  return window.solana??window.phantom?.solana??window.solflare??window.backpack?.solana??null;
}

async function expectJson(response:Response){const data=await response.json();if(!response.ok)throw new Error(data?.error?.message??`Request failed (${response.status})`);return data;}

export async function authenticateExternalSolanaWallet(name:string){
  const provider=injectedProvider(name);if(!provider)throw new Error(`${name} is not available in this browser.`);
  const connected=await provider.connect();const wallet=connected.publicKey.toString();
  const challenge=await expectJson(await fetch('/api/v1/auth/wallet/challenge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({wallet,network:'SOLANA'})}));
  const signed=await provider.signMessage(new TextEncoder().encode(challenge.message),'utf8');
  const signature=signed instanceof Uint8Array?signed:signed.signature;
  await expectJson(await fetch('/api/v1/auth/wallet/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({challengeId:challenge.challengeId,wallet,signature:base58Encode(signature)})}));
  return {provider,wallet};
}

export async function signPreparedSolanaTransaction(name:string,transactionBase64:string){
  const provider=injectedProvider(name);if(!provider)throw new Error(`${name} is not available for transaction signing.`);
  if(!provider.publicKey) await provider.connect({onlyIfTrusted:true}).catch(()=>provider.connect());
  const bytes=bytesFromBase64(transactionBase64);
  try {
    const tx=VersionedTransaction.deserialize(bytes);
    const signed=await provider.signTransaction(tx);
    return base64FromBytes(signed.serialize());
  } catch {
    const tx=Transaction.from(bytes);
    const signed=await provider.signTransaction(tx);
    return base64FromBytes(signed.serialize({requireAllSignatures:true,verifySignatures:true}));
  }
}
