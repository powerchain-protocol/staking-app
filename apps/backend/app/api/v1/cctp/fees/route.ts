import { ok, route } from '@/lib/server/http';
import { assertCctpConfigured, cctpFees } from '@/lib/integrations/cctp';
import { env } from '@/lib/server/config';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=route(async()=>{assertCctpConfigured();return ok(await cctpFees(env.cctpSourceDomainId!,env.cctpDestinationDomainId!));});
