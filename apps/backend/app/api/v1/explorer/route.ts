import { ApiError, ok, route } from '@/lib/server/http';
import { solscanUrl } from '@/lib/solana/solscan';
import { suiscanUrl } from '@/lib/sui/suiscan';
export const GET=route(async(request:Request)=>{const u=new URL(request.url);const chain=(u.searchParams.get('chain')??'SOLANA').toUpperCase();const kind=u.searchParams.get('kind')??'tx';const value=u.searchParams.get('value')??'';if(!value)throw new ApiError(400,'INVALID_ARGUMENT','value is required');if(chain==='SOLANA')return ok({url:solscanUrl((kind==='token'?'token':kind==='account'?'account':'tx') as any,value)});if(chain==='SUI')return ok({url:suiscanUrl((kind==='object'?'object':kind==='account'?'account':'tx') as any,value)});throw new ApiError(400,'INVALID_CHAIN','chain must be SOLANA or SUI');});
