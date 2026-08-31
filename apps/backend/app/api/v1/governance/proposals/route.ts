import { ok, route } from '@/lib/server/http';
import { listGovernanceProposals } from '@/lib/server/governance';
export const runtime = 'nodejs';
export const GET = route(async () => ok({ proposals: await listGovernanceProposals() }));
