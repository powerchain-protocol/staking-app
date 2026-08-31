# PowerChain On-Chain Programs v1.0.0

`/programs` is the protocol execution layer used by `apps/backend`. The backend no longer treats program IDs as opaque addresses: deep readiness derives and verifies the protocol PDAs/vault topology created by these programs.

## Solana programs

### `powerchain_staking`

Purpose: canonical PWRC Token-2022 staking positions.

PDAs / token accounts:

```text
global-config      = PDA("global-config")
pool               = PDA("pool", poolId)
position           = PDA("position", owner, sha256(intentId))
staking vault      = ATA(PWRC, global-config)
reward vault       = PDA token account("reward-vault"), authority = global-config
```

User execution:

```text
stake
increase_stake
request_unstake
cancel_unstake
withdraw
claim_rewards
compound_rewards
```

Administrative execution:

```text
initialize_global
create_pool
update_pool
accrue_rewards
set_paused
rotate_authority
```

Security boundary:
- staking principal and rewards are separate accounts;
- claims cannot exceed the on-chain `claimable_rewards_atomic` entitlement;
- withdrawals cannot occur before lock/cooldown policy permits them;
- the raw database UUID is never used as a Solana PDA seed; its SHA-256 digest is used instead.

### `powerchain_governance`

PDAs:

```text
governance-config  = PDA("governance-config")
proposal           = PDA("proposal", sha256(proposalKey))
voter-weight       = PDA("voter-weight", wallet)
vote-record        = PDA("vote", proposal, wallet)
```

A vote consumes the currently published voter-weight record. A user cannot submit a custom transaction with an invented voting weight. One `vote-record` per wallet/proposal makes duplicate voting fail at the account layer.

Proposal execution requires quorum, FOR > AGAINST, voting completion and the configured execution delay. `execute_proposal` finalizes the approved `action_hash`; downstream privileged protocol actions should separately bind themselves to that hash rather than letting governance execute arbitrary unchecked accounts.

### `powerchain_bonds`

Purpose: slashable operator/verifier service collateral, explicitly separate from ordinary staking.

```text
bonds-config       = PDA("bonds-config")
bond               = PDA("bond", role, owner, sha256(serviceType))
bond vault         = ATA(PWRC, bonds-config)
```

Lifecycle:

```text
create_bond → ACTIVE
increase_bond
request_unbond → UNBONDING
withdraw_bond → WITHDRAWN
```

`slash_bond` is an administrator-only policy action and emits the supplied evidence hash.

### `powerchain_bridge`

Purpose: Solana PWRC reserve custody for the Sui wPWRC bridge.

```text
bridge-config      = PDA("bridge-config")
reserve vault      = ATA(PWRC, bridge-config)
lock record        = PDA("lock", owner, nonce)
release receipt    = PDA("release", messageHash)
```

`release receipt` makes a verified Sui burn/message one-time on Solana. The backend additionally requires:

```text
PWRC_BRIDGE_RESERVE_AUTHORITY = bridge-config PDA
PWRC_BRIDGE_RESERVE_TOKEN_ACCOUNT = ATA(PWRC, bridge-config)
```

before bridge readiness can pass.

## Sui wPWRC package

`programs/sui/wpwrc_bridge` publishes:

```text
0x<PACKAGE_ID>::wpwrc::WPWRC
```

The shared `BridgeTreasury` wraps the `TreasuryCap<WPWRC>`. `mint_from_solana` is bridge-admin controlled and replay-protected by a 256-bit Solana message ID. `burn_to_solana` destroys wPWRC and emits a monotonically increasing burn nonce used to form the return message.

The backend independently reads the Sui treasury total supply through gRPC and verifies:

```text
wPWRC total supply <= verified Solana PWRC bridge reserve
```

## Initialization order

```text
1. Deploy PWRC Token-2022 mint and verify canonical mint policy.
2. Deploy four Solana programs.
3. anchor keys sync and rebuild with the actual deployment program IDs.
4. Initialize staking global config and pools.
5. Initialize governance config.
6. Initialize bonds config.
7. Initialize bridge config/reserve.
8. Publish the Sui wPWRC package.
9. Configure WPWRC_COIN_TYPE and SUI_GRPC_URL.
10. Configure backend program IDs and exact derived vault/PDA addresses.
11. Publish governance voter weights and staking reward entitlements through authorized operational flows.
12. Run reconciliation and deep readiness.
13. Confirm reward-vault solvency and bridge reserve coverage.
14. Only then set EXECUTION_ENABLED=true.
```

## Build verification

Source-level compatibility is checked by:

```bash
npm run programs:audit
```

A production release must additionally run the real toolchains:

```bash
npm run programs:build
npm run programs:test
npm run programs:sui:build
npm run programs:sui:test
```

The repository must not claim on-chain build verification unless those commands have actually passed in the release environment.

## Runtime topology API

- `GET /api/v1/programs/topology` deterministically derives the exact PDAs/vault addresses expected by this workspace.
- `GET /api/v1/programs/verify` requires all four Solana programs, verifies executable loader ownership, and verifies initialized config/vault ownership against the derived topology.

Topology derivation is configuration evidence, **not deployment evidence**. Execution remains disabled until deep readiness passes.

## Token-2022 extension boundary

PWRC direct wallet transfers can resolve Token-2022 TransferHook extra accounts, but the v1.0.0 staking, service-bond and bridge programs intentionally do not accept arbitrary hook account metas. Therefore protocol readiness rejects a PWRC mint carrying the `TransferHook` extension. The canonical transfer-fee extension is supported; on-chain programs measure the actual net vault credit so a Token-2022 transfer fee cannot inflate staked principal, bonds or bridge reserves.

See `programs/DEPLOYMENT.md` for deployment evidence and activation gates.
