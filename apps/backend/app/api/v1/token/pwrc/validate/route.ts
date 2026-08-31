import { ok, route } from '@/lib/server/http';
import { validatePwrcMint } from '@/lib/server/pwrc';
export const runtime = 'nodejs';
export const GET = route(async () => ok(await validatePwrcMint()));
