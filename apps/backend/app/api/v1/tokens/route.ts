import { ok, route } from '@/lib/server/http';
import { canonicalTokens } from '@/lib/data/tokens';
export const GET=route(async()=>ok({tokens:canonicalTokens()}));
