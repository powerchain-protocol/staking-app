import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'db', 'migrations');

function migrationBody(text) {
  // Files are readable standalone SQL, but the migrator owns the transaction so the
  // schema change and schema_migrations record commit atomically.
  return text
    .replace(/^\s*BEGIN\s*;\s*/i, '')
    .replace(/\s*COMMIT\s*;\s*$/i, '')
    .trim();
}

try {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await fs.readdir(migrationsDir))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b, 'en'));

  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const text = await fs.readFile(fullPath, 'utf8');
    const checksum = crypto.createHash('sha256').update(text).digest('hex');
    const [existing] = await sql`SELECT checksum FROM schema_migrations WHERE version=${file} LIMIT 1`;
    if (existing) {
      if (existing.checksum !== checksum) throw new Error(`Migration checksum mismatch for ${file}. Never edit an applied migration; create a new one.`);
      console.log(`skip ${file}`);
      continue;
    }

    await sql.begin(async (tx) => {
      await tx.unsafe(migrationBody(text));
      await tx`INSERT INTO schema_migrations(version, checksum) VALUES(${file}, ${checksum})`;
    });
    console.log(`applied ${file}`);
  }
  console.log('PowerChain Staking database migrations complete.');
} finally {
  await sql.end();
}
