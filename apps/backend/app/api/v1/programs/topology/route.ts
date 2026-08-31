import { ok, route } from '@/lib/server/http';
import { deriveProtocolTopology } from '@/lib/server/programs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deterministically derives the PDAs and Token-2022 vault addresses expected by
 * the checked-in /programs workspace. This endpoint does not claim deployment;
 * use /api/v1/programs/verify for executable/owner verification.
 */
export const GET = route(async () => ok({
  version: '1.0.0',
  topology: deriveProtocolTopology(),
  note: 'Derived addresses only. Deployment/executable ownership must pass /api/v1/programs/verify and system readiness.',
}));
