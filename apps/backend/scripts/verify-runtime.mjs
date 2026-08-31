const origin = (process.env.BACKEND_ORIGIN ?? process.env.APP_ORIGIN ?? 'http://localhost:4000').replace(/\/$/, '');

async function get(path) {
  const response = await fetch(`${origin}${path}`, { headers: { accept: 'application/json' } });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  console.log(`${response.status} ${path}`);
  if (!response.ok || !data?.ok) {
    console.error(text);
    throw new Error(`${path} is not healthy`);
  }
  return data;
}

function namedCheck(payload, name) {
  const check = Array.isArray(payload?.checks) ? payload.checks.find((item) => item?.name === name) : null;
  if (!check?.ok) throw new Error(`Readiness check ${name} is missing or unhealthy`);
  return check;
}

const health = await get('/api/v1/system/health');
if (health.kind !== 'HEALTH') throw new Error('Health endpoint did not return HEALTH semantics');
const readiness = await get('/api/v1/system/readiness');
if (readiness.kind !== 'READINESS') throw new Error('Readiness endpoint did not return READINESS semantics');

if (!readiness.prospectiveExecutionChecked) throw new Error('Readiness did not perform prospective execution validation');
if (!readiness.executionConfigFingerprint) throw new Error('Readiness execution configuration fingerprint is missing');

const reward = namedCheck(readiness, 'reward_vault');
if (reward.data?.covered !== true) throw new Error('Reward vault is not fully covered');

const bridge = namedCheck(readiness, 'bridge_reserves');
if (bridge.data?.covered !== true || bridge.data?.verificationStatus !== 'VERIFIED') throw new Error('PWRC/wPWRC bridge reserve is not verified and covered');

namedCheck(readiness, 'reconciliation_worker');
namedCheck(readiness, 'pwrc_token_2022');
namedCheck(readiness, 'solana_programs');
namedCheck(readiness, 'receipt_chain');
namedCheck(readiness, 'webhook_dead_letters');
namedCheck(readiness, 'operational_alerts');

console.log(JSON.stringify({
  ok: true,
  version: readiness.version,
  healthCheckedAt: health.checkedAt,
  readinessCheckedAt: readiness.checkedAt,
  executionConfigFingerprint: readiness.executionConfigFingerprint,
  rewardVaultCovered: true,
  bridgeReserveCovered: true,
}, null, 2));
