import { requireSession } from '@/lib/server/session';import { ok,route } from '@/lib/server/http';import { walletService } from '@/services/wallet.service';
export const runtime='nodejs';export const dynamic='force-dynamic';export const GET=route(async()=>{const session=await requireSession();return ok(await walletService.balances(session));});
