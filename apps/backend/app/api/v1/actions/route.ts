import { ok,route } from '@/lib/server/http';import { actionsService } from '@/services/actions.service';
export const runtime='nodejs';export const dynamic='force-dynamic';export const GET=route(async()=>ok({version:'1.0.0',actions:await actionsService.list()}));
