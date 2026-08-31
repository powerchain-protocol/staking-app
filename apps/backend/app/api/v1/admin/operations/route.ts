import { ok, route } from '@/lib/server/http';
import { requireAdminSession } from '@/lib/server/controls';
import { operationalOverview } from '@/lib/server/operations';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export const GET=route(async()=>{await requireAdminSession();return ok(await operationalOverview());});
