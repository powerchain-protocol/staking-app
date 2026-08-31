# PowerChain Canonical UI/UX Visual System

Canonical product version: **v1.0.0**

PowerChain uses a restrained engineered visual system: white canvas, black typography and primary actions, neutral structural surfaces, dark green only for PowerChain operational semantics, and red only for destructive or failed states.

## Tokens

| Role | Token |
|---|---|
| Canvas | `#ffffff` |
| Primary text/action | `#0a0a0a` |
| Secondary surface/input | `#f5f5f5` |
| Sidebar/subtle surface | `#fafafa` |
| Secondary text | `#525252` |
| Muted text | `#737373` |
| Hairline | `#e5e5e5` |
| Operational PowerChain | `#0b6b38` |
| Destructive/failure | `#e7000b` |

No other chromatic UI colors are canonical.

## Geometry

- Interactive controls: **18px** radius.
- Cards, panels, modals and substantial containers: **24px** radius.
- Do not introduce another radius token.

## Primary actions

Black is the default primary action treatment:

```css
background: #0a0a0a;
color: #ffffff;
border-radius: 18px;
```

Dark green may be used only for an explicitly operational PowerChain action or state. Do not place equal-weight black and green CTAs beside one another without clear hierarchy.

## Cards

Every card requires the 1px hairline and restrained stacked shadow:

```css
border: 1px solid #e5e5e5;
border-radius: 24px;
box-shadow:
  0 1px 1px rgba(10,10,10,.025),
  0 1px 2px rgba(10,10,10,.035),
  0 2px 4px rgba(10,10,10,.025);
```

## Typography

The canonical interface family is **Geist** with system fallbacks.

Display headline:

```css
font-size: 48px;
font-weight: 600;
line-height: 1.02;
letter-spacing: -0.05em;
```

Body and metadata text must be at least **14px**. Tracking must stay between `-0.05em` and `0.05em`.

## Semantic color

- `#0b6b38`: connected, healthy, verified, reconciled, operational network/energy states and PowerChain-specific operational icons.
- `#e7000b`: failure, destructive actions, slashing, critical security or invalid configuration only.
- Warnings that are not destructive remain neutral rather than introducing amber/orange.

## Prohibited styling

- gradients
- glassmorphism or blur-backed translucent cards
- colored shadows or glows
- arbitrary chromatic accents
- body text below 14px
- arbitrary radii
- card surfaces without a hairline
- UI that implies backend truth not verified by authoritative state

## Application surfaces

The same token contract applies to:

- `apps/web`
- `apps/dashboard`
- authentication
- staking and positions
- rewards and claims
- governance
- PWRC/wallet surfaces
- network and bridge status
- Copilot/AI
- legal, settings, errors and empty states

The backend is visually irrelevant but remains authoritative for all operational UI state.
