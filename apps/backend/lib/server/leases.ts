import 'server-only';
import crypto from 'node:crypto';
import { db } from './db';

export async function acquireLease(leaseName: string, ownerId: string, ttlSeconds: number) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const rows = await db()`
    INSERT INTO worker_leases(lease_name,owner_id,lease_token,expires_at)
    VALUES(${leaseName},${ownerId},${token},${expiresAt})
    ON CONFLICT(lease_name) DO UPDATE SET
      owner_id=EXCLUDED.owner_id,
      lease_token=EXCLUDED.lease_token,
      acquired_at=now(),
      heartbeat_at=now(),
      expires_at=EXCLUDED.expires_at
    WHERE worker_leases.expires_at < now() OR worker_leases.owner_id=${ownerId}
    RETURNING lease_token,expires_at
  `;
  if (!rows[0]) return null;
  return { leaseName, ownerId, token: String(rows[0].lease_token), expiresAt: new Date(rows[0].expires_at) };
}

export async function releaseLease(leaseName: string, token: string) {
  await db()`DELETE FROM worker_leases WHERE lease_name=${leaseName} AND lease_token=${token}`;
}
