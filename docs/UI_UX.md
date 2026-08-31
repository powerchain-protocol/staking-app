# PowerChain Staking v1.0.0 — Canonical UI/UX Guide

The supplied desktop references remain the layout/composition baseline. The canonical visual-token layer is defined by `docs/DESIGN_SYSTEM.md` and `packages/ui/src/tokens.ts`.

## Visual hierarchy

- Canvas: `#ffffff`.
- Primary text and primary actions: `#0a0a0a`.
- Soft control/input surface: `#f5f5f5`.
- Sidebar/subtle panels: `#fafafa`.
- Hairline: `#e5e5e5`.
- Secondary text: `#525252`.
- Muted meaningful text: `#737373`.
- PowerChain operational green: `#0b6b38`.
- Destructive/failure red: `#e7000b` only.

No gradient, glass, colored shadow, decorative chromatic accent, or arbitrary surface color is canonical.

## Geometry

- Buttons, inputs, selectors, badges, chips and tabs: `18px`.
- Cards, panels, modals and major containers: `24px`.
- Cards always retain a 1px neutral hairline plus the canonical three-layer near-flat shadow.

## Typography

- Canonical family: Geist with system fallbacks.
- Display headline: `48px / 600 / 1.02 / -0.05em`.
- Body and metadata: minimum 14px.
- Tracking is clamped between `-0.05em` and `0.05em`.

## Actions

Black-on-white inversion is the default primary CTA. Dark green may be used for a specifically operational PowerChain action or verified/connected state, but it must not compete with the primary CTA without hierarchy. Red is reserved for destructive/failure actions and conditions.

## Layout

- Top bar: approximately 68px.
- Operational sidebar: approximately 240px.
- Contextual right rail: approximately 330–360px where needed.
- Overview may remove the left rail to retain the reference composition.
- Mobile collapses navigation without changing token semantics.

## Operational truth

Account-specific values must come from authenticated backend APIs. Representative network aggregates must be marked representative. State-changing actions follow review → wallet approval → submit → finalized verification → reconciliation → immutable receipt and never imply completion at signature submission.

## AI/Copilot

Copilot uses the same visual system as staking and wallet surfaces. Evidence status may use dark green only when grounded/verified. Missing evidence remains neutral/unavailable; destructive security failures use red. Raw model tokens never bypass verification just to improve perceived streaming speed.
