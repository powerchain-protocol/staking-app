import { ok,route } from '@/lib/server/http';import { systemService } from '@/services/system.service';
export const runtime='nodejs';export const dynamic='force-dynamic';export const GET=route(async()=>{const result=await systemService.readiness();return ok(result,{status:result.ok?200:503});});
