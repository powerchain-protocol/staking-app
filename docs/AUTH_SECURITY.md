# Identity, Wallet Signatures & Confirmations — v1.0.0

PowerChain deliberately separates **account identity**, **wallet ownership**, and **transaction authorization**.

```text
Account identity (Clerk default / Better Auth optional)
        ↓
Wallet challenge signature
        ↓
Verified account ↔ wallet binding
        ↓
Authoritative server intent / quote
        ↓
Optional exact-action confirmation for privileged off-chain actions
        ↓
Prepared blockchain message hash
        ↓
User wallet transaction signature
        ↓
Submission → finality → reconciliation → ledger → immutable receipt
```

## Primary identity

`AUTH_PROVIDER=clerk` is the production default. The backend verifies the Clerk session JWT and constrains authorized parties to the configured application origins. Clerk user lifecycle events are accepted only through the Svix-verified webhook endpoint and are synchronized into the PowerChain user/profile tables.

`BETTER_AUTH_ENABLED=true` enables the secondary Better Auth service at `/api/auth/[...all]`. `AUTH_PROVIDER=better-auth` can be paired with `NEXT_PUBLIC_AUTH_PROVIDER=better-auth` for deployments that intentionally choose that stack. Hybrid mode tries Clerk first and Better Auth second. Better Auth uses dedicated `auth_*` PostgreSQL tables and can expose email/password plus configured Google, GitHub and Apple providers.

## Wallet verification

A wallet is not an account credential. After account sign-in the backend creates a short-lived challenge containing the canonical account subject, wallet, network, cluster/origin, nonce and expiry. Solana challenges use Ed25519 verification. Sui challenges use personal-message verification. The nonce is single-use.

When `REQUIRE_PRIMARY_IDENTITY=true`, a valid wallet session is rejected unless its account subject matches the currently authenticated account.

## Privileged off-chain confirmations

High-risk off-chain administrative mutations use `/api/v1/auth/confirmations/*`. The challenge signs the exact canonical payload hash and is bound to:

- account subject;
- verified wallet;
- network;
- action name;
- canonical SHA-256 action hash;
- nonce;
- expiry.

The returned confirmation token is stored only as a hash and can be consumed exactly once through `x-powerchain-confirmation`. This confirmation **does not replace** the transaction signature required for blockchain state changes.

## Social login

For Clerk deployments, enabled social providers are configured in Clerk and rendered by the Clerk SignIn component. For Better Auth deployments, `NEXT_PUBLIC_BETTER_AUTH_SOCIAL_PROVIDERS` controls which configured providers are shown and backend OAuth credentials remain server-side.

## Mail

`lib/mail/mail.ts` is the only outbound-mail service boundary. Mail is disabled by default. When enabled, verification and lifecycle emails are sent server-side; the browser never receives the provider API key.

## Required production configuration

- `AUTH_PROVIDER`
- `REQUIRE_PRIMARY_IDENTITY=true`
- Clerk: `CLERK_SECRET_KEY` or `CLERK_JWT_KEY`, plus `CLERK_WEBHOOK_SIGNING_SECRET`
- Better Auth when enabled: `BETTER_AUTH_SECRET` (minimum 32 characters), `BETTER_AUTH_URL`
- social provider credentials only for providers intentionally enabled
- `ACTION_CONFIRMATION_REQUIRED=true`
- `SESSION_SECRET`

Never put provider secrets in `NEXT_PUBLIC_*` variables.
