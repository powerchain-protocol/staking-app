import { requireAdminSession } from '@/lib/server/controls';
import { aiOperationalOverview } from '@/lib/ai/metrics';
import { ok, route } from '@/lib/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=route(async()=>{await requireAdminSession();return ok(await aiOperationalOverview());});
