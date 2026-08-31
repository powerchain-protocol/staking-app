# PowerChain `/programs/` deployment

Canonical protocol version: **1.0.0**

The source IDs committed in `Anchor.toml` and each Rust crate are deterministic development placeholders. They are **not** declarations of a production deployment. Production activation requires building, synchronizing deploy keypairs, deploying, verifying executable ownership, initializing protocol PDAs, and only then configuring the backend with the deployed addresses.

## Solana order

1. Install the Solana and Anchor toolchains pinned/compatible with `Anchor.toml`.
2. Run `anchor keys sync` inside `programs/`. Review every changed `declare_id!` and `Anchor.toml` address.
3. `anchor build`. Preserve the generated IDLs and program binaries as release artifacts.
4. Deploy **staking**, **governance**, **bonds**, then **bridge** to the intended cluster.
5. Initialize protocol configuration accounts using an authorized administrative wallet:
   - staking: `global-config`, Token-2022 staking ATA, `reward-vault`, and canonical staking pools;
   - governance: `governance-config`;
   - bonds: `bonds-config` and Token-2022 bond ATA;
   - bridge: `bridge-config` and Token-2022 reserve ATA.
6. Configure the backend with the exact deployed program IDs and PDA-derived vaults.
7. Check `GET /api/v1/programs/topology`.
8. Check `GET /api/v1/programs/verify`. It must verify all four programs as executable under an accepted Solana loader and verify the initialized account topology.
9. Check `GET /api/v1/token/pwrc/validate`. Protocol execution v1.0.0 rejects a PWRC TransferHook extension because staking/bond/bridge CPIs do not accept arbitrary hook extra-account metas.
10. Run deep system readiness and confirm reward-vault solvency plus PWRC/wPWRC bridge reserve coverage before enabling execution.

## Sui wPWRC

1. Build and test `programs/sui/wpwrc_bridge`.
2. Publish the package to the selected Sui network.
3. Record the package/object transaction digest and package ID.
4. Configure `WPWRC_COIN_TYPE=0x<PACKAGE_ID>::wpwrc::WPWRC` and `SUI_GRPC_URL`.
5. Verify the Sui treasury supply is covered by the Solana PWRC reserve before bridge execution is enabled.

## Release evidence

A production release should preserve at minimum:

- source commit and source SHA-256 manifest;
- Anchor/Solana/Sui toolchain versions;
- generated IDLs;
- program/package binaries and hashes;
- deploy/publish transaction signatures;
- program/package IDs;
- initialization transaction signatures;
- derived topology output;
- `/api/v1/programs/verify` output;
- Token-2022 PWRC validation output;
- deep readiness output;
- bridge coverage and reward-vault solvency snapshots.

No source placeholder ID, sample RPC URL, or example coin type may be treated as production evidence.
