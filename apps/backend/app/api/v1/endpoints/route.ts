import { listEndpoints } from '@/lib/services/endpoints.service';import { ok,route } from '@/lib/server/http';
export const runtime='nodejs';export const GET=route(async()=>ok({version:'1.0.0',basePath:'/api/v1',endpoints:listEndpoints()}));
