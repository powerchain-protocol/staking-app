import 'server-only';
import crypto from 'node:crypto';
import { db, type Sql } from './db';

export type LedgerLine = {
  accountCode: string;
  amountAtomic: bigint;
  subjectId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function postJournal(input: { sourceType: string; sourceId: string; asset?: string; lines: LedgerLine[] }, tx?: Sql) {
  if (input.lines.length < 2) throw new Error('Double-entry journal requires at least two lines');
  const sum = input.lines.reduce((acc, line) => acc + line.amountAtomic, 0n);
  if (sum !== 0n) throw new Error(`Ledger journal is unbalanced: ${sum}`);
  const sql = tx ?? db();
  const asset = input.asset ?? 'PWRC';
  const journalId = crypto.randomUUID();
  const guard = await sql`
    INSERT INTO ledger_journals(journal_id,source_type,source_id,asset,line_count)
    VALUES(${journalId},${input.sourceType},${input.sourceId},${asset},${input.lines.length})
    ON CONFLICT(source_type,source_id,asset) DO NOTHING
    RETURNING journal_id
  `;
  if (!guard[0]) {
    const [existing] = await sql`SELECT journal_id FROM ledger_journals WHERE source_type=${input.sourceType} AND source_id=${input.sourceId} AND asset=${asset} LIMIT 1`;
    return String(existing.journal_id);
  }
  for (const line of input.lines) {
    await sql`
      INSERT INTO ledger_entries(journal_id,subject_id,account_code,asset,amount_atomic,source_type,source_id,metadata)
      VALUES(${journalId},${line.subjectId ?? null},${line.accountCode},${asset},${line.amountAtomic.toString()},${input.sourceType},${input.sourceId},${sql.json(line.metadata ?? {})})
    `;
  }
  return journalId;
}
