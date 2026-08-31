import 'server-only';
import type { RegisteredAction } from '@powerchain/contracts';
import { db } from '@/lib/server/db';

export async function listRegisteredActions(): Promise<RegisteredAction[]> {
  const rows = await db()`SELECT action_id,title,description,method,endpoint,execution_domain,enabled,metadata,updated_at FROM action_registry WHERE enabled=true ORDER BY action_id`;
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    actionId: String(row.action_id),
    title: String(row.title),
    description: String(row.description),
    method: String(row.method) as RegisteredAction['method'],
    endpoint: String(row.endpoint),
    executionDomain: row.execution_domain ? String(row.execution_domain) : null,
    enabled: Boolean(row.enabled),
    metadata: (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>,
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }));
}

export const actionsService = { list: listRegisteredActions };
