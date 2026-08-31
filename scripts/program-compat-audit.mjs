import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const pass = [];
const fail = [];
const ok = (name, condition) => (condition ? pass : fail).push(name);
const read = (rel) => fs.readFile(path.join(root, rel), 'utf8');
const exists = async (rel) => { try { await fs.access(path.join(root, rel)); return true; } catch { return false; } };

const required = [
  'programs/Anchor.toml',
  'programs/Cargo.toml',
  'programs/README.md',
  'programs/DEPLOYMENT.md',
  'programs/solana/staking/src/lib.rs',
  'programs/solana/governance/src/lib.rs',
  'programs/solana/bonds/src/lib.rs',
  'programs/solana/bridge/src/lib.rs',
  'programs/sui/wpwrc_bridge/Move.toml',
  'programs/sui/wpwrc_bridge/sources/wpwrc.move',
  'apps/backend/lib/server/anchor.ts',
];
for (const rel of required) ok(`file:${rel}`, await exists(rel));
if (fail.length) {
  console.error(fail.map(x => `FAIL ${x}`).join('\n'));
  process.exit(1);
}

const anchorToml = await read('programs/Anchor.toml');
const cargo = await read('programs/Cargo.toml');
const backend = await read('apps/backend/lib/server/anchor.ts');
const pwrc = await read('apps/backend/lib/server/pwrc.ts');
const topologyRoute = await read('apps/backend/app/api/v1/programs/topology/route.ts');
const verifyRoute = await read('apps/backend/app/api/v1/programs/verify/route.ts');
const staking = await read('programs/solana/staking/src/lib.rs');
const governance = await read('programs/solana/governance/src/lib.rs');
const bonds = await read('programs/solana/bonds/src/lib.rs');
const bridge = await read('programs/solana/bridge/src/lib.rs');
const move = await read('programs/sui/wpwrc_bridge/sources/wpwrc.move');

ok('anchor-version-pinned', anchorToml.includes('anchor_version = "1.1.2"') && cargo.includes('version = "=1.1.2"'));

const ids = {
  staking: 'GEEXw67SDvppmYS1arWpNBxxJgcK7js4YTYq2QQNAeSh',
  governance: '9KMi9SuzLHujJTVVuuzKrkVQ5V49ye8Qdw6snTohDbX7',
  bonds: 'EpqCcMN2Ac2SnQuQaXmmNh61q8mD2YexoiESHAZosRBD',
  bridge: 'EgWd4FYsnbxZeZUZ8jzQeLhY3Eo2PLPHgkApHTvCdLNy',
};
for (const [name, id] of Object.entries(ids)) {
  const source = { staking, governance, bonds, bridge }[name];
  ok(`program-id:${name}`, anchorToml.includes(id) && source.includes(`declare_id!("${id}")`));
}

for (const ix of ['stake', 'increase_stake', 'request_unstake', 'cancel_unstake', 'withdraw', 'claim_rewards', 'compound_rewards']) {
  ok(`staking-ix:${ix}`, staking.includes(`pub fn ${ix}`) && backend.includes(`'${ix}'`));
}
ok('staking-position-seed-hash', backend.includes("seed32(intentId)") && staking.includes('intent_seed: [u8; 32]'));
ok('staking-separate-reward-vault', backend.includes('PWRC_REWARD_VAULT_TOKEN_ACCOUNT') && staking.includes('reward_vault') && staking.includes('claimable_rewards_atomic'));
ok('staking-token-2022-interface', staking.includes('TokenInterface') && staking.includes('TransferChecked'));

ok('governance-weight-pda', backend.includes("Buffer.from('voter-weight')") && governance.includes('VoterWeight'));
ok('governance-vote-record', backend.includes("Buffer.from('vote')") && governance.includes('VoteRecord'));
ok('governance-execution-timelock', governance.includes('execution_delay_seconds') && governance.includes('ExecutionTimelock'));

ok('bond-service-hash', backend.includes('seed32(serviceType)') && bonds.includes('service_hash: [u8; 32]'));
ok('bond-role-seed', backend.includes('stringArg(roleSeed)') && bonds.includes('role_seed: String'));
ok('bond-slash-evidence', bonds.includes('slash_bond') && bonds.includes('evidence_hash: [u8; 32]'));

ok('bridge-solana-replay-protection', bridge.includes('ReleaseReceipt') && bridge.includes('message_hash: [u8; 32]'));
ok('bridge-sui-replay-protection', move.includes('processed_solana_messages') && move.includes('E_ALREADY_PROCESSED'));
ok('bridge-wpwrc-treasury-wrapped', move.includes('treasury_cap: TreasuryCap<WPWRC>'));
ok('bridge-wpwrc-mint-burn', move.includes('mint_from_solana') && move.includes('burn_to_solana'));

for (const [name, source] of Object.entries({ staking, governance, bonds, bridge, move })) {
  const opens = (source.match(/\{/g) || []).length;
  const closes = (source.match(/\}/g) || []).length;
  ok(`balanced-braces:${name}`, opens === closes);
  ok(`no-unimplemented:${name}`, !source.includes('unimplemented!') && !source.includes('todo!'));
}

ok('protocol-transfer-hook-boundary', pwrc.includes('protocol_transfer_hook_unsupported') && pwrc.includes('ExtensionType.TransferHook'));
ok('program-topology-api', topologyRoute.includes('deriveProtocolTopology'));
ok('program-verify-require-all', verifyRoute.includes('requireAll: true'));

console.log('PowerChain /programs compatibility audit');
for (const name of pass) console.log(`PASS  ${name}`);
for (const name of fail) console.log(`FAIL  ${name}`);
if (fail.length) {
  console.error(`\nProgram compatibility audit failed: ${fail.length} issue(s).`);
  process.exit(1);
}
console.log(`\nProgram compatibility audit passed: ${pass.length} checks.`);
