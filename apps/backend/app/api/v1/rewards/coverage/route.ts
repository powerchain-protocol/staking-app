import { ok, route } from '@/lib/server/http';
import { rewardVaultCoverage } from '@/lib/server/rewards';
export const runtime = 'nodejs';
export const GET = route(async () => ok(await rewardVaultCoverage()));
