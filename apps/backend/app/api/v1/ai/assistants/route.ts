import{assistants}from'@/lib/ai/catalog';import{ok,route}from'@/lib/server/http';export const runtime='nodejs';export const GET=route(async()=>ok({assistants}));
