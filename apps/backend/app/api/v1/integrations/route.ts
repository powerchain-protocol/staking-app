import { ok, route } from '@/lib/server/http';
import { integrationHealth, integrationRegistry } from '@/lib/integrations/registry';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=route(async()=>ok({registry:integrationRegistry(),health:await integrationHealth()}));
