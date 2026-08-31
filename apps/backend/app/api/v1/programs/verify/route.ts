import { ok, route } from '@/lib/server/http';
import { verifySolanaPrograms } from '@/lib/server/programs';

export const runtime = 'nodejs';
export const GET = route(async () => ok(await verifySolanaPrograms({ requireAll: true })));
