import { ok,route } from '@/lib/server/http';import { verifyBridgeReserves } from '@/lib/server/bridge';
export const runtime='nodejs';export const dynamic='force-dynamic';export const GET=route(async()=>ok(await verifyBridgeReserves()));
