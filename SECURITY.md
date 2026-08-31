# Security Policy — PowerChain Staking v1.0.0

## Core invariants

- User private keys and seed phrases are never stored by the application server.
- Execution fails closed when critical program, mint, vault, provider or chain configuration is missing.
- State-changing APIs require fresh readiness, reward-vault solvency and PWRC/wPWRC reserve attestations when the production safety gate is enabled.
- A readiness attestation is bound to a non-secret fingerprint of the mint/program/vault/bridge/Sui execution configuration; configuration changes invalidate the prior authorization state.
- Client-provided balances, rewards, governance weight and settlement state are never authoritative.
- Transaction messages are hashed at prepare time and must be byte-equivalent when submitted after signing. This applies to staking, governance, bonds and PWRC transfers.
- Submission is not settlement; completed state requires finalized-chain reconciliation.
- Staking principal, reward funds, operator/verifier bonds and bridge reserves are separate accounting domains.
- Reward claims and business journals are idempotent.
- Immutable receipts are hash chained and can be HMAC sealed.
- Ordinary staking is not slashable service collateral.

## Secrets

Production secrets belong in a managed secret store, never source control. Rotate at minimum:

- `SESSION_SECRET`
- `RECEIPT_SEAL_SECRET`
- `INTERNAL_WORKER_SECRET`
- `CRON_SECRET`
- `HELIUS_API_KEY`
- `HELIUS_WEBHOOK_AUTH_TOKEN`
- embedded-wallet provider credentials

## Mainnet enablement

Keep `EXECUTION_ENABLED=false` until the production checklist in `docs/PRODUCTION.md` is complete and both `/api/v1/system/health` and `/api/v1/system/readiness` are healthy. Confirm reward-vault coverage and bridge reserve coverage in the readiness payload before enabling execution.


## PWRC transfer boundary

PWRC transfers are prepared exclusively against the configured Token-2022 mint. The server derives associated token accounts, verifies existing token-account ownership/mint, calculates the current epoch transfer fee and presents the recipient net amount before signing. Recipient ATA creation is idempotent and paid by the authenticated fee payer. No server signing key is introduced.

## Helius webhook boundary

The Helius webhook `authHeader` must exactly match `HELIUS_WEBHOOK_AUTH_TOKEN`. The receiver compares the complete `Authorization` header in constant time. Helius events can accelerate discovery but never replace finalized RPC verification.

## Embedded wallet boundary

Embedded wallets are disabled by default. Enabling requires explicit provider URL/API credentials and, in production, the provider webhook secret. The public capabilities endpoint controls whether enrollment is exposed in the UI.

## Operational resilience controls

State mutation is protected by three independent layers:

1. deployment-level `EXECUTION_ENABLED` and configuration prerequisites;
2. freshness-bound readiness/reward/bridge attestations;
3. database-backed runtime controls for global and domain-specific emergency pause.

Administrative runtime-control changes require an authenticated allowlisted wallet and are recorded as security events. Reconciliation can automatically trip the global circuit breaker when exception thresholds are exceeded. Chain webhook failures use bounded retries and dead-lettering to avoid infinite poison-message loops.

## Request and audit hardening

- JSON request bodies are streamed with a hard 1 MiB ceiling rather than trusting `Content-Length`.
- Excessive JSON nesting and prototype-sensitive object keys are rejected.
- Wallet-authentication requests validate the supplied Solana/Sui address shape before persisting challenges.
- Authentication is rate-limited by both request origin/IP bucket and wallet bucket.
- API responses include request and trace identifiers for incident correlation.
- Authenticated state-changing audit events carry the session subject and wallet address.
- Administrative reconciliation requeues are constrained to submitted, reviewable intents with an existing chain signature and generate security events.

## Account identity and wallet separation

Clerk is the default account identity provider; Better Auth is an intentional optional alternative/secondary boundary. A valid account session alone cannot authorize chain state changes. When `REQUIRE_PRIMARY_IDENTITY=true`, protected wallet sessions must belong to the same canonical account subject. Wallet ownership is verified through short-lived single-use Solana/Sui message challenges.

Clerk lifecycle webhooks use Svix signature verification before profile synchronization. Better Auth uses dedicated PostgreSQL auth tables and server-side OAuth credentials. Social login never grants blockchain signing authority.

## Exact-action confirmations

Privileged off-chain changes can require a one-time `x-powerchain-confirmation`. The confirmation is bound to the account, verified wallet, action name, canonical payload hash, nonce and expiry. Only a token hash is persisted. A confirmation cannot be replayed against a changed payload and does not replace a blockchain transaction signature.

## AI and computing

AI is disabled by default and is never a signing principal. When enabled, requests are account-authenticated, rate-limited, checked for secret/private-key material, constrained by model/tool allowlists, and routed through a server-side HMAC-signed gateway. `AI_ALLOW_STATE_CHANGES=false` is the production default. The AI layer cannot bypass execution readiness, runtime controls, wallet approval, reconciliation, ledger or receipt invariants.

## AI reliability and prompt governance

AI provider failures are tracked in a persistent circuit-breaker table and fallback is restricted to deployment-allowlisted providers. Prompt versions are fingerprinted and immutable: reusing a registered version with changed prompt contents fails closed. RAG candidates are trust/quality scored, validity checked, diversified by source and stripped of instruction-like source lines before entering model context. Approved tools require explicit input/result-size contracts.

PowerChain streams Copilot progress stages rather than raw model tokens so unsupported text cannot be rendered before output DLP and evidence verification. AI policy evaluations and user feedback are stored separately for release/operations review; neither creates execution authority.
