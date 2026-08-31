import 'server-only';
import { db } from './db';
import { ApiError } from './http';
import { requireSession, type Session } from './session';
import { env } from './config';
import { requestContext } from './request-context';

export type RuntimeControl = 'GLOBAL' | 'STAKING' | 'GOVERNANCE' | 'BONDS' | 'TRANSFERS' | 'REWARDS' | 'BRIDGE' | 'AI';

const domainControl: Record<string, RuntimeControl> = {
  STAKING: 'STAKING',
  GOVERNANCE: 'GOVERNANCE',
  BONDS: 'BONDS',
  TRANSFERS: 'TRANSFERS',
  WALLET: 'TRANSFERS',
  REWARDS: 'REWARDS',
  BRIDGE: 'BRIDGE',
  AI: 'AI',
};

export async function assertRuntimeControl(domain: string) {
  const key = domainControl[domain] ?? domain;
  const rows = await db()`
    SELECT control_key,enabled,reason,expires_at
    FROM execution_controls
    WHERE control_key IN ('GLOBAL',${key})
  `;
  for (const row of rows as Array<Record<string, any>>) {
    const expired = row.expires_at && new Date(row.expires_at).getTime() <= Date.now();
    if (!row.enabled && !expired) {
      throw new ApiError(503, 'EXECUTION_PAUSED', `${row.control_key} execution is paused`, {
        control: row.control_key,
        reason: row.reason ?? 'Operational pause',
        expiresAt: row.expires_at ?? null,
      });
    }
  }
}

export async function listRuntimeControls() {
  return db()`SELECT control_key,enabled,reason,changed_by,expires_at,updated_at FROM execution_controls ORDER BY control_key`;
}

function adminWallets() {
  return new Set([...env.stakingAdminWallets, ...env.bondAdminWallets, ...env.governanceProposerWallets]);
}

export function assertAdminSession(session: Session) {
  if (!adminWallets().has(session.wallet)) throw new ApiError(403, 'ADMIN_REQUIRED', 'An authorized PowerChain administrative wallet is required');
}

export async function requireAdminSession() {
  const session = await requireSession();
  assertAdminSession(session);
  return session;
}

export async function setRuntimeControl(input: { key: RuntimeControl; enabled: boolean; reason?: string | null; expiresAt?: Date | null; changedBy: string }) {
  const [row] = await db()`
    INSERT INTO execution_controls(control_key,enabled,reason,changed_by,expires_at,updated_at)
    VALUES(${input.key},${input.enabled},${input.reason ?? null},${input.changedBy},${input.expiresAt ?? null},now())
    ON CONFLICT(control_key) DO UPDATE SET enabled=excluded.enabled,reason=excluded.reason,changed_by=excluded.changed_by,expires_at=excluded.expires_at,updated_at=now()
    RETURNING control_key,enabled,reason,changed_by,expires_at,updated_at
  `;
  await db()`INSERT INTO security_events(event_type,severity,wallet_address,request_id,source,details) VALUES('EXECUTION_CONTROL_CHANGED',${input.enabled ? 'WARNING' : 'CRITICAL'},${input.changedBy},${requestContext()?.requestId ?? null},'ADMIN_API',${db().json({ control: input.key, enabled: input.enabled, reason: input.reason ?? null, expiresAt: input.expiresAt?.toISOString() ?? null })})`;
  return row;
}

export async function tripGlobalCircuit(reason: string, source = 'AUTOMATIC_CIRCUIT_BREAKER') {
  await db()`
    INSERT INTO execution_controls(control_key,enabled,reason,changed_by,updated_at)
    VALUES('GLOBAL',false,${reason},${source},now())
    ON CONFLICT(control_key) DO UPDATE SET enabled=false,reason=excluded.reason,changed_by=excluded.changed_by,expires_at=NULL,updated_at=now()
  `;
  await db()`INSERT INTO security_events(event_type,severity,source,details) VALUES('GLOBAL_CIRCUIT_TRIPPED','CRITICAL',${source},${db().json({ reason })})`;
}
