import { ok, route } from '@/lib/server/http';
import { solanaHealth } from '@/lib/server/solana';
export const runtime = 'nodejs';
export const GET = route(async () => ok(await solanaHealth()));
