import 'server-only';
import { db, type Sql } from './db';
import { canonicalJson, hmac, sha256 } from './crypto';
import { env } from './config';

const CHAIN = 'POWERCHAIN_STAKING_V1';

export async function createImmutableReceipt(input: { subjectId?: string | null; receiptType: string; sourceId: string; payload: Record<string, unknown>; chainSignature?: string | null }, tx?: Sql) {
  const sql = tx ?? db();
  const [existing] = await sql`SELECT * FROM immutable_receipts WHERE receipt_type=${input.receiptType} AND source_id=${input.sourceId} LIMIT 1`;
  if (existing) return existing;

  await sql`INSERT INTO receipt_chain_heads(chain_name) VALUES(${CHAIN}) ON CONFLICT DO NOTHING`;
  const [head] = await sql`SELECT * FROM receipt_chain_heads WHERE chain_name=${CHAIN} FOR UPDATE`;
  const previousHash = head?.head_hash ? String(head.head_hash) : null;
  const sequence = BigInt(String(head?.sequence ?? 0)) + 1n;
  const envelope = {
    receiptVersion: 1,
    chainName: CHAIN,
    sequence: sequence.toString(),
    previousHash,
    receiptType: input.receiptType,
    sourceId: input.sourceId,
    subjectId: input.subjectId ?? null,
    payload: input.payload,
    chainSignature: input.chainSignature ?? null,
  };
  const receiptHash = sha256(canonicalJson(envelope));
  const receiptSeal = env.receiptSealSecret ? hmac(receiptHash, env.receiptSealSecret) : null;
  const [created] = await sql`
    INSERT INTO immutable_receipts(subject_id,receipt_type,source_id,payload,previous_hash,receipt_hash,chain_signature,chain_name,sequence,receipt_version,receipt_seal)
    VALUES(${input.subjectId ?? null},${input.receiptType},${input.sourceId},${sql.json(input.payload)},${previousHash},${receiptHash},${input.chainSignature ?? null},${CHAIN},${sequence.toString()},1,${receiptSeal})
    RETURNING *
  `;
  await sql`UPDATE receipt_chain_heads SET sequence=${sequence.toString()},head_hash=${receiptHash},updated_at=now() WHERE chain_name=${CHAIN}`;
  return created;
}

export async function verifyReceiptChain(limit = 10_000) {
  const rows = await db()`SELECT * FROM immutable_receipts WHERE chain_name=${CHAIN} ORDER BY sequence ASC LIMIT ${limit}`;
  let previousHash: string | null = null;
  let expectedSequence = 1n;
  for (const row of rows as Array<Record<string, any>>) {
    if (BigInt(String(row.sequence)) !== expectedSequence) return { valid: false, reason: 'SEQUENCE_GAP', sequence: expectedSequence.toString() };
    if ((row.previous_hash ?? null) !== previousHash) return { valid: false, reason: 'PREVIOUS_HASH_MISMATCH', sequence: expectedSequence.toString() };
    const envelope = {
      receiptVersion: Number(row.receipt_version), chainName: String(row.chain_name), sequence: String(row.sequence), previousHash,
      receiptType: String(row.receipt_type), sourceId: String(row.source_id), subjectId: row.subject_id ?? null,
      payload: row.payload, chainSignature: row.chain_signature ?? null,
    };
    const expectedHash = sha256(canonicalJson(envelope));
    if (expectedHash !== row.receipt_hash) return { valid: false, reason: 'HASH_MISMATCH', sequence: expectedSequence.toString() };
    if (env.receiptSealSecret && hmac(expectedHash, env.receiptSealSecret) !== row.receipt_seal) return { valid: false, reason: 'SEAL_MISMATCH', sequence: expectedSequence.toString() };
    previousHash = expectedHash;
    expectedSequence += 1n;
  }
  return { valid: true, receiptsChecked: rows.length, headHash: previousHash };
}
