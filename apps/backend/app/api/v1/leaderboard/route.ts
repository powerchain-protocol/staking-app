import { ok, route } from '@/lib/server/http';
import { leaderboard } from '@/lib/leaderboard';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=route(async(request:Request)=>{const u=new URL(request.url);return ok({policy:'verified-participation-v1',entries:await leaderboard(Number(u.searchParams.get('limit')??100))});});
