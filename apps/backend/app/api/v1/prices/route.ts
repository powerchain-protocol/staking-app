import { ok, route } from '@/lib/server/http';
import { prices } from '@/lib/prices';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=route(async(request:Request)=>{const u=new URL(request.url);const symbols=(u.searchParams.get('symbols')??'SOL,PWRC').split(',').map(x=>x.trim()).filter(Boolean).slice(0,20);return ok({prices:await prices(symbols)});});
