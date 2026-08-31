import { requireAdminSession } from '@/lib/server/controls';
import { latestEvalSummary, runPolicyEvals } from '@/lib/ai/evals';
import { ok, route } from '@/lib/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=route(async()=>{await requireAdminSession();return ok(await latestEvalSummary());});
export const POST=route(async()=>{await requireAdminSession();return ok(await runPolicyEvals());});
