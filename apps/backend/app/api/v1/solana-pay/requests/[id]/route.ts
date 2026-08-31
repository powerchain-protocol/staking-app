import { requireSession } from '@/lib/server/session';
import { ApiError, ok, route } from '@/lib/server/http';
import { db } from '@/lib/server/db';
import { resolveSolanaPayReference } from '@/lib/integrations/solana-pay';
import { atomicToUi } from '@/lib/utils/calculators';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=route(async(_request:Request,{params}:{params:Promise<{id:string}>})=>{const s=await requireSession();const {id}=await params;const [r]=await db()`SELECT * FROM solana_pay_requests WHERE id=${id}::uuid AND subject_id=${s.sub}`;if(!r)throw new ApiError(404,'PAY_REQUEST_NOT_FOUND','Solana Pay request not found');if(r.status==='OPEN'&&(!r.expires_at||new Date(r.expires_at)>new Date())){try{const found=await resolveSolanaPayReference({reference:r.reference_address,recipient:r.recipient,amount:Number(atomicToUi(r.amount_atomic,r.decimals)),splToken:r.token_mint??undefined});const [updated]=await db()`UPDATE solana_pay_requests SET status='PAID',signature=${found.signature},updated_at=now() WHERE id=${id}::uuid RETURNING *`;return ok({request:updated});}catch{}}if(r.status==='OPEN'&&r.expires_at&&new Date(r.expires_at)<=new Date()){const [updated]=await db()`UPDATE solana_pay_requests SET status='EXPIRED',updated_at=now() WHERE id=${id}::uuid RETURNING *`;return ok({request:updated});}return ok({request:r});});
