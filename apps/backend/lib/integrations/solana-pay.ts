import 'server-only';
import { createMerchantClient } from '@solana/pay';
import { address } from '@solana/kit';
import { solanaRpcUrl } from '@/lib/solana/solana';

export function createSolanaPayUrl(input:{recipient:string;amount:number;splToken?:string;label?:string;message?:string;memo?:string;reference?:string}){
  const merchant=createMerchantClient({rpcUrl:solanaRpcUrl()});
  const url=merchant.pay.encodeURL({
    recipient:address(input.recipient),
    amount:input.amount,
    ...(input.splToken?{splToken:address(input.splToken)}:{}),
    ...(input.reference?{reference:address(input.reference)}:{}),
    label:input.label??'PowerChain',
    message:input.message,
    memo:input.memo,
  } as any);
  return url.toString();
}


export async function resolveSolanaPayReference(input:{reference:string;recipient:string;amount:number;splToken?:string}){
  const merchant=createMerchantClient({rpcUrl:solanaRpcUrl()});
  const reference=address(input.reference);const recipient=address(input.recipient);
  const found=await merchant.pay.findReference(reference as any);
  await merchant.pay.validateTransfer((found as any).signature,{recipient,amount:input.amount,reference,...(input.splToken?{splToken:address(input.splToken)}:{})} as any);
  return {signature:(found as any).signature};
}
