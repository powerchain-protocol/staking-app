import { clearSessionCookie } from '@/lib/server/session';
import { ok, route } from '@/lib/server/http';

export const POST = route(async () => { await clearSessionCookie(); return ok({ loggedOut: true }); });
