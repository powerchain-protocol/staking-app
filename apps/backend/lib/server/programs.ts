import 'server-only';
import { PublicKey } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { env, ConfigurationError } from './config';
import { solanaConnection } from './solana';

const ACCEPTED_LOADERS = new Set([
  'BPFLoaderUpgradeab1e11111111111111111111111',
  'BPFLoader2111111111111111111111111111111111',
  'BPFLoader1111111111111111111111111111111111',
]);

type ProgramDomain = 'staking' | 'governance' | 'bonds' | 'bridge';

function configuredPrograms(): Array<{ domain: ProgramDomain; address: string }> {
  return [
    { domain: 'staking' as const, address: env.stakingProgramId },
    { domain: 'governance' as const, address: env.governanceProgramId },
    { domain: 'bonds' as const, address: env.bondsProgramId },
    { domain: 'bridge' as const, address: env.bridgeProgramId },
  ].filter((item) => Boolean(item.address));
}

export function deriveProtocolTopology() {
  if (!env.stakingProgramId || !env.governanceProgramId || !env.bondsProgramId || !env.bridgeProgramId || !env.pwrcMint) {
    throw new ConfigurationError('All PowerChain program IDs and PWRC_MINT are required to derive protocol topology');
  }
  const stakingProgram = new PublicKey(env.stakingProgramId);
  const governanceProgram = new PublicKey(env.governanceProgramId);
  const bondsProgram = new PublicKey(env.bondsProgramId);
  const bridgeProgram = new PublicKey(env.bridgeProgramId);
  const mint = new PublicKey(env.pwrcMint);

  const [stakingConfig] = PublicKey.findProgramAddressSync([Buffer.from('global-config')], stakingProgram);
  const [rewardVault] = PublicKey.findProgramAddressSync([Buffer.from('reward-vault')], stakingProgram);
  const stakingVault = getAssociatedTokenAddressSync(mint, stakingConfig, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  const [governanceConfig] = PublicKey.findProgramAddressSync([Buffer.from('governance-config')], governanceProgram);

  const [bondsConfig] = PublicKey.findProgramAddressSync([Buffer.from('bonds-config')], bondsProgram);
  const bondsVault = getAssociatedTokenAddressSync(mint, bondsConfig, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  const [bridgeConfig] = PublicKey.findProgramAddressSync([Buffer.from('bridge-config')], bridgeProgram);
  const bridgeReserve = getAssociatedTokenAddressSync(mint, bridgeConfig, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  return {
    staking: { programId: stakingProgram.toBase58(), config: stakingConfig.toBase58(), stakingVault: stakingVault.toBase58(), rewardVault: rewardVault.toBase58() },
    governance: { programId: governanceProgram.toBase58(), config: governanceConfig.toBase58() },
    bonds: { programId: bondsProgram.toBase58(), config: bondsConfig.toBase58(), vault: bondsVault.toBase58() },
    bridge: { programId: bridgeProgram.toBase58(), config: bridgeConfig.toBase58(), reserve: bridgeReserve.toBase58() },
  };
}

async function verifyProtocolTopology() {
  const topology = deriveProtocolTopology();
  const expected = [
    ['PWRC_STAKING_VAULT_TOKEN_ACCOUNT', env.stakingVaultTokenAccount, topology.staking.stakingVault],
    ['PWRC_REWARD_VAULT_TOKEN_ACCOUNT', env.rewardVaultTokenAccount, topology.staking.rewardVault],
    ['PWRC_BRIDGE_RESERVE_TOKEN_ACCOUNT', env.bridgeReserveTokenAccount, topology.bridge.reserve],
    ['PWRC_BRIDGE_RESERVE_AUTHORITY', env.bridgeReserveAuthority, topology.bridge.config],
  ] as const;
  for (const [name, configured, derived] of expected) {
    if (!configured) throw new ConfigurationError(`${name} is required for protocol topology verification`);
    if (configured !== derived) throw new ConfigurationError(`${name} does not match the PDA-derived /programs topology: expected ${derived}, got ${configured}`);
  }

  const connection = solanaConnection();
  const accountSpecs = [
    { name: 'staking_config', address: topology.staking.config, owner: topology.staking.programId },
    { name: 'staking_vault', address: topology.staking.stakingVault, owner: TOKEN_2022_PROGRAM_ID.toBase58() },
    { name: 'reward_vault', address: topology.staking.rewardVault, owner: TOKEN_2022_PROGRAM_ID.toBase58() },
    { name: 'governance_config', address: topology.governance.config, owner: topology.governance.programId },
    { name: 'bonds_config', address: topology.bonds.config, owner: topology.bonds.programId },
    { name: 'bonds_vault', address: topology.bonds.vault, owner: TOKEN_2022_PROGRAM_ID.toBase58() },
    { name: 'bridge_config', address: topology.bridge.config, owner: topology.bridge.programId },
    { name: 'bridge_reserve', address: topology.bridge.reserve, owner: TOKEN_2022_PROGRAM_ID.toBase58() },
  ];

  const checks = [];
  for (const spec of accountSpecs) {
    const info = await connection.getAccountInfo(new PublicKey(spec.address), env.solanaCommitment);
    const actualOwner = info?.owner.toBase58() ?? null;
    const exists = Boolean(info);
    const ownerOk = actualOwner === spec.owner;
    checks.push({ ...spec, exists, actualOwner, ownerOk });
  }
  if (!checks.every((item) => item.exists && item.ownerOk)) {
    throw new ConfigurationError('PowerChain /programs protocol account topology is not initialized or does not match configured program ownership');
  }
  return { ok: true, topology, accounts: checks };
}

export async function verifySolanaPrograms(options: { requireAll?: boolean } = {}) {
  const programs = configuredPrograms();
  if (options.requireAll && programs.length !== 4) {
    throw new ConfigurationError('All Solana staking/governance/bonds/bridge program IDs are required');
  }
  if (!programs.length) throw new ConfigurationError('No PowerChain Solana program IDs are configured');

  const connection = solanaConnection();
  const results = [];
  for (const program of programs) {
    const key = new PublicKey(program.address);
    const info = await connection.getAccountInfo(key, env.solanaCommitment);
    const owner = info?.owner.toBase58() ?? null;
    const executable = Boolean(info?.executable);
    const loaderAccepted = Boolean(owner && ACCEPTED_LOADERS.has(owner));
    results.push({ domain: program.domain, programId: program.address, executable, owner, loaderAccepted });
  }
  const ok = results.every((item) => item.executable && item.loaderAccepted);
  if (!ok) throw new ConfigurationError('One or more configured PowerChain Solana programs failed deployment verification');
  const topology = options.requireAll ? await verifyProtocolTopology() : null;
  return { ok, cluster: env.solanaCluster, programs: results, topology };
}
