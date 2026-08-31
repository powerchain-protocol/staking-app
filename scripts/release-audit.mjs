import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(); const failures=[]; const passes=[];
const pass=(x)=>passes.push(x); const fail=(x)=>failures.push(x);
async function exists(rel){try{await fs.access(path.join(root,rel));pass(`file:${rel}`)}catch{fail(`missing:${rel}`)}}
async function text(rel){return fs.readFile(path.join(root,rel),'utf8')}
async function json(rel){return JSON.parse(await text(rel))}
const rootPkg=await json('package.json');
if(rootPkg.version==='1.0.0')pass('canonical-version');else fail('canonical-version');
for(const rel of ['apps/web/package.json','apps/dashboard/package.json','apps/backend/package.json','packages/ui/package.json','packages/api-client/package.json','packages/contracts/package.json']){
  const p=await json(rel); if(p.version==='1.0.0')pass(`version:${rel}`);else fail(`version:${rel}`);
}
for(const rel of [
  'apps/web/app/page.tsx','apps/dashboard/app/page.tsx','apps/dashboard/app/stake/page.tsx','apps/dashboard/app/positions/page.tsx','apps/dashboard/app/rewards/page.tsx','apps/dashboard/app/pwrc/page.tsx','apps/dashboard/app/governance/page.tsx','apps/dashboard/app/network/page.tsx','apps/dashboard/app/activity/page.tsx','apps/dashboard/app/learn/page.tsx',
  'apps/backend/app/api/v1/system/health/route.ts','apps/backend/app/api/v1/system/readiness/route.ts',
  'apps/backend/app/api/v1/programs/topology/route.ts',
  'apps/backend/app/api/v1/programs/verify/route.ts','apps/backend/app/api/v1/staking/intents/route.ts','apps/backend/app/api/v1/rewards/overview/route.ts','apps/backend/app/api/v1/governance/intents/route.ts','apps/backend/app/api/v1/bonds/intents/route.ts','apps/backend/app/api/v1/wallets/transfers/route.ts','apps/backend/app/api/v1/bridge/reserves/route.ts','apps/backend/app/api/webhooks/helius/route.ts','apps/backend/app/api/internal/reconcile/route.ts',
  'apps/backend/lib/server/safety-gate.ts','apps/backend/lib/server/reconciliation.ts','apps/backend/lib/server/ledger.ts','apps/backend/lib/server/receipts.ts','apps/backend/lib/server/bridge.ts','apps/backend/lib/server/rewards.ts','apps/backend/lib/server/staking.ts','apps/backend/lib/server/governance.ts','apps/backend/lib/server/bonds.ts','apps/backend/lib/server/transfers.ts',
  'apps/backend/db/migrations/006_observability_and_recovery.sql','apps/backend/db/migrations/010_identity_ai_confirmations.sql','apps/backend/db/migrations/011_ai_runtime.sql','apps/backend/db/migrations/012_ai_reliability_evals.sql','apps/backend/db/migrations/013_realtime_transport.sql',
  'apps/backend/app/api/v1/route.ts','apps/backend/app/api/v1/auth/identity/route.ts','apps/backend/app/api/v1/auth/confirmations/challenge/route.ts','apps/backend/app/api/v1/auth/confirmations/verify/route.ts','apps/backend/app/api/webhooks/clerk/route.ts','apps/backend/app/api/v1/ai/capabilities/route.ts','apps/backend/app/api/v1/ai/chat/route.ts','apps/backend/app/api/v1/ai/chat/stream/route.ts','apps/backend/app/api/v1/ai/feedback/route.ts','apps/backend/app/api/v1/admin/ai/evals/route.ts','apps/backend/app/api/v1/admin/ai/overview/route.ts','apps/backend/app/api/v1/ai/conversations/[id]/route.ts',
  'apps/backend/lib/auth/identity.ts','apps/backend/lib/auth/better-auth.ts','apps/backend/lib/auth/confirmations.ts','apps/backend/lib/ai/security.ts','apps/backend/lib/ai/orchestrator.ts','apps/backend/lib/ai/grounding.ts','apps/backend/lib/ai/providers.ts','apps/backend/lib/ai/provider-health.ts','apps/backend/lib/ai/prompts.ts','apps/backend/lib/ai/tool-contracts.ts','apps/backend/lib/ai/evals.ts','apps/backend/lib/ai/metrics.ts','apps/backend/lib/ai/retention.ts','apps/backend/lib/mail/mail.ts','apps/backend/lib/mail/email-template.ts','apps/backend/lib/tokens/trusted-tokens.csv','apps/backend/config/system.ts','apps/backend/protocols/index.ts',
  'docs/AI_EVALS.md','apps/dashboard/lib/powerchain/ai-api.ts','docs/REALTIME.md','apps/backend/realtime/server.ts','apps/backend/realtime/start.ts','apps/backend/realtime/check.ts','apps/backend/lib/realtime/token.ts','apps/backend/lib/realtime/events.ts','apps/backend/lib/realtime/topics.ts','apps/backend/app/api/v1/realtime/status/route.ts','apps/backend/app/api/v1/realtime/token/route.ts','apps/backend/app/api/v1/realtime/events/route.ts','apps/backend/app/api/v1/endpoints/route.ts','apps/dashboard/lib/realtime.ts','apps/dashboard/hooks/use-realtime.ts','apps/dashboard/hooks/use-live-query.ts','apps/dashboard/services/intent.service.ts','packages/contracts/src/realtime.ts','packages/api-client/src/realtime.ts','scripts/realtime-audit.mjs',
  'apps/dashboard/app/login/login-form.tsx','apps/dashboard/app/not-found.tsx','apps/dashboard/app/error.tsx','apps/dashboard/pages/404.tsx','apps/dashboard/app/legals/terms/page.tsx','apps/dashboard/app/legals/privacy/page.tsx','apps/dashboard/app/legals/security/page.tsx','apps/dashboard/app/legals/disclosures/page.tsx','apps/web/app/not-found.tsx','apps/web/app/error.tsx','apps/web/pages/404.tsx','apps/web/app/legals/terms/page.tsx','apps/web/app/legals/privacy/page.tsx','apps/web/app/legals/security/page.tsx','apps/web/app/legals/disclosures/page.tsx','docs/AUTH_SECURITY.md','docs/AI_SECURITY.md','apps/backend/README.md','apps/dashboard/README.md','apps/web/README.md','apps/dashboard/components/error-boundary.tsx','apps/dashboard/components/ui/toast.tsx','apps/dashboard/components/ui/forms/field.tsx','apps/dashboard/components/messages.tsx','apps/dashboard/components/informations.tsx','apps/dashboard/lib/powerchain/api.ts','apps/dashboard/lib/powerchain/staking-api.ts','apps/dashboard/redirects/index.ts','apps/dashboard/types/events.ts','apps/dashboard/hooks/use-events.ts',
  'programs/Anchor.toml','programs/Cargo.toml','programs/README.md',
  'programs/DEPLOYMENT.md',
  'programs/solana/staking/src/lib.rs','programs/solana/governance/src/lib.rs','programs/solana/bonds/src/lib.rs','programs/solana/bridge/src/lib.rs',
  'programs/sui/wpwrc_bridge/Move.toml','programs/sui/wpwrc_bridge/sources/wpwrc.move','docs/PROGRAMS.md','scripts/program-compat-audit.mjs',
  'references/overview.jpeg','references/rewards.jpeg','references/governance.jpeg','references/pwrc.jpeg','references/network.jpeg'
]) await exists(rel);

const dashboardConfig=await text('apps/dashboard/next.config.ts');
for(const marker of ['BACKEND_URL','/api/:path*','@powerchain/ui']) dashboardConfig.includes(marker)?pass(`dashboard-proxy:${marker}`):fail(`dashboard-proxy:${marker}`);
const shell=await text('apps/dashboard/components/app-shell.tsx');
for(const marker of ['Overview','Stake','Positions','Rewards','PWRC','Governance','Network','Activity','Learn','PowerChainLogo','overview-grid']) shell.includes(marker)?pass(`dashboard-shell:${marker}`):fail(`dashboard-shell:${marker}`);
const css=await text('apps/dashboard/app/globals.css');
for(const marker of ['--background:#ffffff','--foreground:#0a0a0a','--brand:#0b6b38','--danger:#e7000b','pwrc-balance-grid','network-ecosystem-grid','governance-activity-grid','pc-logo']) css.includes(marker)?pass(`design:${marker}`):fail(`design:${marker}`);
for(const rel of ['docs/DESIGN_SYSTEM.md','packages/ui/src/tokens.ts','scripts/design-system-audit.mjs']) await exists(rel);

const env=await text('apps/backend/.env.example');
for(const marker of ['APP_ORIGIN=http://localhost:3001','BACKEND_ORIGIN=http://localhost:4000','EXECUTION_ENABLED=false','SUI_GRPC_URL=','WPWRC_COIN_TYPE=','HELIUS_WEBHOOK_AUTH_TOKEN=','EMBEDDED_WALLETS_ENABLED=false','AUTH_PROVIDER=clerk','REQUIRE_PRIMARY_IDENTITY=true','CLERK_SECRET_KEY=','CLERK_WEBHOOK_SIGNING_SECRET=','ACTION_CONFIRMATION_REQUIRED=true','AI_ENABLED=false','AI_ALLOW_STATE_CHANGES=false','AI_PROVIDER_FALLBACKS=','AI_RAG_MIN_EVIDENCE_SCORE=','AI_EVAL_MIN_PASS_RATE=','AI_PROMPT_VERSION=']) env.includes(marker)?pass(`env:${marker.split('=')[0]}`):fail(`env:${marker.split('=')[0]}`);
const worker=await text('apps/backend/scripts/run-worker.mjs'); worker.includes('BACKEND_ORIGIN')?pass('worker-backend-origin'):fail('worker-backend-origin');
const rootScripts=rootPkg.scripts??{};
for(const name of ['auth:audit','ai:audit','ui:audit','integrations:audit','programs:audit','design:audit']) rootScripts[name]?pass(`script:${name}`):fail(`script:${name}`);
const sessionSource=await text('apps/backend/lib/server/session.ts');sessionSource.includes('IDENTITY_WALLET_SESSION_MISMATCH')?pass('auth:identity-wallet-binding'):fail('auth:identity-wallet-binding');
const aiSecurity=await text('apps/backend/lib/ai/security.ts');aiSecurity.includes('AI_STATE_CHANGE_BLOCKED')?pass('ai:state-change-fail-closed'):fail('ai:state-change-fail-closed');
const healthSource=await text('apps/backend/lib/server/system-health.ts');for(const marker of ['013_realtime_transport.sql','identity_security','ai_security','realtime_transport']) healthSource.includes(marker)?pass(`readiness:${marker}`):fail(`readiness:${marker}`);


const anchorBridge = await text('apps/backend/lib/server/anchor.ts');
for(const marker of ["seed32(intentId)","PWRC_REWARD_VAULT_TOKEN_ACCOUNT","Buffer.from('voter-weight')","seed32(serviceType)"]) anchorBridge.includes(marker)?pass(`program-wire:${marker}`):fail(`program-wire:${marker}`);
const programConfig=await text('programs/Anchor.toml');
for(const marker of ['anchor_version = "1.1.2"','powerchain_staking','powerchain_governance','powerchain_bonds','powerchain_bridge']) programConfig.includes(marker)?pass(`program-config:${marker}`):fail(`program-config:${marker}`);
const programsServer=await text('apps/backend/lib/server/programs.ts');
for(const marker of ['deriveProtocolTopology','reward-vault','bridge-config','PWRC_STAKING_VAULT_TOKEN_ACCOUNT']) programsServer.includes(marker)?pass(`program-topology:${marker}`):fail(`program-topology:${marker}`);
const pwrcServer=await text('apps/backend/lib/server/pwrc.ts'); pwrcServer.includes('protocol_transfer_hook_unsupported')?pass('program-token2022:transfer-hook-fail-closed'):fail('program-token2022:transfer-hook-fail-closed');
const topologyApi=await text('apps/backend/app/api/v1/programs/topology/route.ts'); topologyApi.includes('deriveProtocolTopology')?pass('program-api:topology'):fail('program-api:topology');
const verifyApi=await text('apps/backend/app/api/v1/programs/verify/route.ts'); verifyApi.includes('requireAll: true')?pass('program-api:verify-all'):fail('program-api:verify-all');

// Dashboard must never contain backend implementation route handlers.
try{await fs.access(path.join(root,'apps/dashboard/app/api'));fail('dashboard-api-routes-should-be-backend-only')}catch{pass('dashboard-api-routes-separated')}

// Do not ship old representative account identities as live application state.
const liveRoots=['apps/dashboard/app','apps/dashboard/components','apps/dashboard/lib'];
const banned=[/7Dh9Kx4RfN2vP4mX/g,/\b82,450 PWRC\b/g];
async function walk(dir,out=[]){for(const e of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,e.name);if(e.isDirectory())await walk(full,out);else if(/\.(ts|tsx)$/.test(e.name))out.push(full)}return out}
for(const lr of liveRoots){for(const f of await walk(path.join(root,lr))){const src=await fs.readFile(f,'utf8');for(const re of banned){re.lastIndex=0;if(re.test(src))fail(`representative-account-data:${path.relative(root,f)}`)}}}
if(!failures.some(x=>x.startsWith('representative-account-data:')))pass('no-representative-account-identities');

// Validate all referenced dashboard Icons exist in the central icon set.
const iconSource=await text('apps/dashboard/components/icons.tsx'); const exported=new Set((iconSource.match(/export const Icons = \{([\s\S]*?)\}/)?.[1]??'').match(/[A-Z][A-Za-z0-9_]*/g)??[]); const used=new Set();
for(const f of await walk(path.join(root,'apps/dashboard'))){if(!f.endsWith('.tsx'))continue;const src=await fs.readFile(f,'utf8');for(const m of src.matchAll(/Icons\.([A-Za-z0-9_]+)/g))used.add(m[1])}
const missing=[...used].filter(x=>!exported.has(x)); missing.length?fail(`missing-icons:${missing.join(',')}`):pass('dashboard-icons-complete');

console.log(`PowerChain Staking Platform v${rootPkg.version} release audit`); for(const x of passes)console.log(`PASS  ${x}`); for(const x of failures)console.log(`FAIL  ${x}`);
if(failures.length){console.error(`\nRelease audit failed: ${failures.length} issue(s).`);process.exit(1)}
console.log(`\nRelease audit passed: ${passes.length} checks.`);
