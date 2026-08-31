# PowerChain wPWRC bridge package

Canonical Sui coin type after publication:

```text
0x<PACKAGE_ID>::wpwrc::WPWRC
```

Set that exact type as `WPWRC_COIN_TYPE` in `apps/backend/.env.local` only after publishing and verifying the package.

The shared `BridgeTreasury` owns the wPWRC `TreasuryCap`, so supply changes occur only through `mint_from_solana` and `burn_to_solana`. The backend independently checks Sui treasury total supply against the Solana PWRC reserve before state-changing execution is considered ready.

`mint_from_solana` is administrator-gated and replay-protected by `solana_message_id`. Production administration should be controlled by a hardened bridge signer / multisig policy rather than a personal hot wallet.
