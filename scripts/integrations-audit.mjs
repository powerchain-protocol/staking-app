import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const passes = [];
const pass = (x) => passes.push(x);
const fail = (x) => failures.push(x);
async function exists(rel) { try { await fs.access(path.join(root, rel)); pass(`file:${rel}`); } catch { fail(`missing:${rel}`); } }
async function text(rel) { return fs.readFile(path.join(root, rel), 'utf8'); }
async function json(rel) { return JSON.parse(await text(rel)); }

const backend = await json('apps/backend/package.json');
for (const [name, expected] of Object.entries({
  'bs58':'6.0.0', '@jup-ag/api':'6.0.48', '@coral-xyz/anchor':'0.32.1', axios:'1.20.0',
  '@solana/web3.js':'1.98.4', '@solana/pay':'1.0.26', pg:'8.23.0', ws:'8.21.3',
  '@prisma/client':'7.10.0', '@supabase/supabase-js':'2.112.4'
})) {
  backend.dependencies?.[name] === expected ? pass(`dependency:${name}@${expected}`) : fail(`dependency:${name}@${expected}`);
}
backend.devDependencies?.prisma === '7.10.0' ? pass('dependency:prisma@7.10.0') : fail('dependency:prisma@7.10.0');

for (const rel of [
  'apps/backend/prisma/schema.prisma','apps/backend/prisma.config.ts',
  'apps/backend/lib/solana/solana.ts','apps/backend/lib/solana/jupiter.ts','apps/backend/lib/solana/metaplex.ts','apps/backend/lib/solana/solscan.ts','apps/backend/lib/solana/meteora.ts','apps/backend/lib/solana/orca.ts','apps/backend/lib/solana/raydium.ts',
  'apps/backend/lib/sui/sui.ts','apps/backend/lib/sui/cetus.ts','apps/backend/lib/sui/deepbook.ts','apps/backend/lib/sui/suiscan.ts',
  'apps/backend/lib/pyth.ts','apps/backend/lib/birdeye.ts','apps/backend/lib/prices.ts',
  'apps/backend/lib/integrations/cctp.ts','apps/backend/lib/integrations/cctp-solana.ts','apps/backend/lib/integrations/cctp-intents.ts','apps/backend/lib/integrations/solana-pay.ts','apps/backend/lib/integrations/swap-intents.ts','apps/backend/lib/integrations/swaps.ts','apps/backend/lib/integrations/zk.ts',
  'apps/backend/app/api/v1/swaps/quote/route.ts','apps/backend/app/api/v1/swaps/intents/route.ts','apps/backend/app/api/v1/cctp/intents/route.ts','apps/backend/app/api/v1/solana-pay/requests/route.ts','apps/backend/app/api/v1/prices/route.ts','apps/backend/app/api/v1/zk/verify/route.ts',
  'apps/backend/utils/supabase/server.ts','apps/dashboard/utils/supabase/client.ts',
  'apps/dashboard/app/integrations/page.tsx','apps/dashboard/app/bridge/page.tsx','apps/dashboard/app/explorer/page.tsx',
  'actions.json','apps/backend/public/actions.json','apps/web/public/actions.json','apps/dashboard/public/actions.json',
  'apps/backend/db/migrations/007_fullstack_integrations.sql','apps/backend/db/migrations/008_execution_integrations.sql'
]) await exists(rel);

const cfg = await text('apps/backend/lib/server/config.ts');
for (const marker of ['deploymentTier','releaseChannel','mainnetBetaAck','jupiterApiUrl','raydiumApiUrl','meteoraApiUrl','orcaApiUrl','cetusApiUrl','deepbookApiUrl','coingeckoApiUrl','coinmarketcapApiUrl','cctpIrisUrl','zkVerifierUrl','supabaseServiceRoleKey']) {
  cfg.includes(marker) ? pass(`config:${marker}`) : fail(`config:${marker}`);
}
const prismaSchema = await text('apps/backend/prisma/schema.prisma');
!/url\s*=\s*env\("DATABASE_URL"\)/.test(prismaSchema) ? pass('prisma7:no-schema-datasource-url') : fail('prisma7:no-schema-datasource-url');
prismaSchema.includes('@default(dbgenerated()) @map("total_score")') ? pass('prisma:generated-leaderboard-score') : fail('prisma:generated-leaderboard-score');
const prismaConfig = await text('apps/backend/prisma.config.ts');
prismaConfig.includes("schema: 'prisma/schema.prisma'") && prismaConfig.includes('DATABASE_URL') ? pass('prisma7:config') : fail('prisma7:config');
const actionSecurity = await text('apps/backend/lib/security/actions.ts');
for (const marker of ["'swap.prepare':'TRANSFERS'","'bridge.cctp':'BRIDGE'","'solana.pay':'TRANSFERS'"]) actionSecurity.includes(marker) ? pass(`safe-action:${marker}`) : fail(`safe-action:${marker}`);

console.log('PowerChain integration audit');
for (const x of passes) console.log(`PASS  ${x}`);
for (const x of failures) console.log(`FAIL  ${x}`);
if (failures.length) { console.error(`\nIntegration audit failed: ${failures.length} issue(s).`); process.exit(1); }
console.log(`\nIntegration audit passed: ${passes.length} checks.`);
