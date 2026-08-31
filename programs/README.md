# PowerChain `/programs` — on-chain protocol v1.0.0

This directory is the canonical on-chain implementation boundary for the staking platform.

```text
programs/
├── Anchor.toml
├── Cargo.toml
├── solana/
│   ├── staking/       PWRC Token-2022 staking + segregated reward-vault claims
│   ├── governance/    weighted proposal voting + execution finalization
│   ├── bonds/         slashable operator / verifier service collateral
│   └── bridge/        PWRC reserve escrow for Solana ↔ Sui bridge flows
└── sui/
    └── wpwrc_bridge/  canonical wPWRC coin + Sui bridge treasury
```

## Non-negotiable invariants

- PWRC is Token-2022 and every token account is checked against the configured mint.
- Staking principal and reward liquidity are separate token accounts.
- A user cannot claim more rewards on-chain than the position's published claimable entitlement.
- Unstake/withdraw obey lock and cooldown state transitions on-chain.
- Operator/verifier collateral is slashable service collateral and is not ordinary staking.
- Governance votes are one-record-per-proposal/per-wallet and consume a published voter-weight record.
- Bridge release messages are replay-protected.
- wPWRC minting requires the Sui bridge administrator and a unique Solana message nonce.
- `wPWRC total supply <= verified Solana PWRC reserve` is checked off-chain by the backend readiness gate and must remain an operational release invariant.

## Program IDs

The IDs committed in `Anchor.toml` and `declare_id!` are deterministic **source placeholders**, not claims about deployed mainnet programs. Do not configure them in production until those exact programs have been deployed and independently verified. After generating production program keypairs, run `anchor keys sync`, rebuild, deploy, then set:

```text
SOLANA_STAKING_PROGRAM_ID
SOLANA_GOVERNANCE_PROGRAM_ID
SOLANA_BONDS_PROGRAM_ID
SOLANA_BRIDGE_PROGRAM_ID
```

The backend already verifies that configured program accounts exist and are executable before execution readiness can pass.

## Build

The workspace pins Anchor `1.1.2` exactly. Use a compatible Solana/Agave toolchain and AVM in CI.

```bash
cd programs
anchor build
anchor test
```

Sui:

```bash
sui move build --path programs/sui/wpwrc_bridge
sui move test --path programs/sui/wpwrc_bridge
```

## Backend compatibility

Run from the repository root:

```bash
npm run programs:audit
```

The audit checks PDA seed conventions and instruction names shared with `apps/backend/lib/server/anchor.ts`. It is intentionally dependency-free so protocol drift is caught before an Anchor build is available.

## Deployment

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the fail-closed deployment and verification sequence. The v1.0.0 protocol rejects Token-2022 `TransferHook` on PWRC at backend readiness because the staking, bonds and bridge CPI interfaces intentionally support the canonical transfer-fee model only.
