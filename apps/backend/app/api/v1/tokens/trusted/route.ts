import {trustedTokens} from '@/lib/tokens/trusted';import {ok,route} from '@/lib/server/http';export const runtime='nodejs';export const GET=route(async()=>ok({tokens:await trustedTokens()}));
