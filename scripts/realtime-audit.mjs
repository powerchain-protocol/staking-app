import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let checks = 0;
let failures = 0;

const pass = (label) => { checks += 1; console.log('PASS ', label); };
const fail = (label) => { checks += 1; failures += 1; console.error('FAIL ', label); };
const full = (rel) => path.join(root, rel);
const read = (rel) => fs.readFileSync(full(rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const file = (rel) => fs.existsSync(full(rel)) ? pass(`file:${rel}`) : fail(`file:${rel}`);
const marker = (rel, value, label) => {
  if (!fs.existsSync(full(rel))) return fail(label);
  read(rel).includes(value) ? pass(label) : fail(label);
};
const absent = (rel, value, label) => {
  if (!fs.existsSync(full(rel))) return fail(label);
  !read(rel).includes(value) ? pass(label) : fail(label);
};

const backend = json('apps/backend/package.json');
for (const [pkg, version, group] of [
  ['ws', '8.21.3', 'dependencies'],
  ['pg', '8.23.0', 'dependencies'],
  ['@next/env', '16.3.3', 'dependencies'],
  ['tsx', '4.20.5', 'devDependencies'],
]) {
  backend[group]?.[pkg] === version ? pass(`backend-dependency:${pkg}@${version}`) : fail(`backend-dependency:${pkg}@${version}`);
}

[
  'apps/backend/db/migrations/013_realtime_transport.sql',
  'apps/backend/realtime/server.ts',
  'apps/backend/realtime/start.ts',
  'apps/backend/realtime/check.ts',
  'apps/backend/realtime/check-start.ts',
  'apps/backend/lib/realtime/token.ts',
  'apps/backend/lib/realtime/events.ts',
  'apps/backend/lib/realtime/topics.ts',
  'apps/backend/services/realtime.service.ts',
  'apps/backend/app/api/v1/realtime/status/route.ts',
  'apps/backend/app/api/v1/realtime/token/route.ts',
  'apps/backend/app/api/v1/realtime/events/route.ts',
  'apps/backend/app/api/v1/endpoints/route.ts',
  'apps/backend/types/realtime.ts',
  'packages/contracts/src/realtime.ts',
  'packages/contracts/src/api.ts',
  'packages/contracts/src/actions.ts',
  'packages/api-client/src/http.ts',
  'packages/api-client/src/client.ts',
  'packages/api-client/src/realtime.ts',
  'apps/dashboard/lib/realtime.ts',
  'apps/dashboard/hooks/use-realtime.ts',
  'apps/dashboard/hooks/use-live-query.ts',
  'apps/dashboard/hooks/use-staking.ts',
  'apps/dashboard/hooks/use-rewards.ts',
  'apps/dashboard/hooks/use-governance.ts',
  'apps/dashboard/hooks/use-wallet-balances.ts',
  'apps/dashboard/hooks/use-system-status.ts',
  'apps/dashboard/hooks/use-intent.ts',
  'apps/dashboard/services/api.service.ts',
  'apps/dashboard/services/realtime.service.ts',
  'apps/dashboard/services/intent.service.ts',
  'apps/dashboard/actions/intent.actions.ts',
  'apps/dashboard/actions/system.actions.ts',
  'apps/dashboard/types/realtime.ts',
  'docs/REALTIME.md',
].forEach(file);

marker('packages/contracts/src/realtime.ts', "powerchain.realtime.v1", 'protocol:versioned');
marker('packages/contracts/src/realtime.ts', "authoritative", 'contracts:authoritative-marker');
marker('apps/backend/db/migrations/013_realtime_transport.sql', "pg_notify('powerchain_realtime'", 'db:notify');
marker('apps/backend/db/migrations/013_realtime_transport.sql', 'Realtime is an invalidation/status transport', 'db:invalidation-only-comment');
marker('apps/backend/db/migrations/013_realtime_transport.sql', "jsonb_build_object('status',status_value,'operation',TG_OP)", 'db:minimal-event-payload');
absent('apps/backend/db/migrations/013_realtime_transport.sql', "jsonb_build_object('balance'", 'db:no-balance-payload');
absent('apps/backend/db/migrations/013_realtime_transport.sql', "prepared_transaction", 'db:no-prepared-transaction-payload');
marker('apps/backend/realtime/server.ts', 'LISTEN powerchain_realtime', 'server:postgres-listen');
marker('apps/backend/realtime/server.ts', 'REALTIME_PROTOCOL', 'server:protocol-negotiation');
marker('apps/backend/realtime/server.ts', 'originAllowed', 'server:origin-policy');
marker('apps/backend/realtime/server.ts', 'realtimeMaxConnectionsPerSubject', 'server:connection-limit');
marker('apps/backend/realtime/server.ts', 'realtimeMaxMessagesPerMinute', 'server:message-rate-limit');
marker('apps/backend/realtime/server.ts', 'realtimeMaxPayloadBytes', 'server:payload-limit');
marker('apps/backend/realtime/server.ts', 'realtimeMaxSubscriptions', 'server:subscription-limit');
marker('apps/backend/realtime/server.ts', "path==='/healthz'", 'server:health-endpoint');
marker('apps/backend/realtime/server.ts', "path==='/readyz'", 'server:readiness-endpoint');
marker('apps/backend/realtime/server.ts', "type:'heartbeat'", 'server:heartbeat');
marker('apps/backend/lib/realtime/token.ts', "createHmac('sha256'", 'token:hmac');
marker('apps/backend/lib/realtime/token.ts', 'timingSafeEqual', 'token:constant-time-signature-check');
marker('apps/backend/lib/realtime/token.ts', 'REALTIME_TOKEN_REPLAYED', 'token:single-use-replay-protection');
marker('apps/backend/app/api/v1/realtime/token/route.ts', 'requirePlatformIdentity', 'token:endpoint-authenticated');
marker('apps/backend/app/api/v1/realtime/events/route.ts', 'requirePlatformIdentity', 'events:catchup-authenticated');
marker('apps/backend/app/api/v1/realtime/status/route.ts', 'authoritativeState:false', 'status:not-authoritative');
marker('apps/backend/lib/server/system-health.ts', "check('realtime_transport'", 'readiness:realtime-transport');
marker('packages/api-client/src/realtime.ts', 'scheduleReconnect', 'client:reconnect');
marker('packages/api-client/src/realtime.ts', 'afterEventId: this.lastEventId', 'client:cursor-replay');
marker('packages/api-client/src/realtime.ts', 'heartbeat timeout', 'client:heartbeat-timeout');
marker('apps/dashboard/hooks/use-live-query.ts', 'pollFallbackMs', 'dashboard:poll-fallback');
marker('apps/dashboard/hooks/use-live-query.ts', "realtimeState==='open'", 'dashboard:realtime-invalidations-preferred');
marker('apps/dashboard/services/intent.service.ts', 'setInterval(()=>void refresh(),3_000)', 'intent:fallback-polling');
marker('apps/dashboard/services/intent.service.ts', 'check Activity before retrying', 'intent:timeout-safe-message');
marker('apps/dashboard/components/runtime-banner.tsx', 'Authoritative API reads remain available', 'ui:realtime-degraded-message');
marker('actions.json', '"authoritativeState": false', 'manifest:realtime-not-authoritative');
marker('apps/backend/.env.example', 'REALTIME_ENABLED=', 'env:realtime-enabled');
marker('apps/backend/.env.example', 'REALTIME_SIGNING_SECRET=', 'env:realtime-signing-secret');
marker('apps/backend/.env.example', 'REALTIME_MAX_PAYLOAD_BYTES=', 'env:realtime-payload-limit');
marker('apps/backend/.env.mainnet-beta.example', 'REALTIME_PUBLIC_URL=wss://', 'env:mainnet-wss');

const serverScript = backend.scripts?.['realtime:start'];
serverScript?.includes('realtime/start.ts') ? pass('script:realtime-start') : fail('script:realtime-start');
const checkScript = backend.scripts?.['realtime:check'];
checkScript?.includes('realtime/check-start.ts') ? pass('script:realtime-check') : fail('script:realtime-check');

if (failures) {
  console.error(`\nRealtime audit failed: ${failures}/${checks}`);
  process.exit(1);
}
console.log(`\nRealtime audit passed: ${checks} checks.`);
