# Ripple onboarding v2 — mockup rationale

This directory is a review-only static design artifact. It contains no production React, authentication, or integration logic.

## Review the mockups

Open `index.html` in a browser. The sticky gallery navigation jumps between the end-to-end flow map and all five desktop screens. Each primary screen is followed by a compact loading, error, and success/continuation treatment.

## Design direction

- One decision per step reduces the cognitive load of the current all-in-one workspace.
- Value is explained before access is requested.
- Human copy describes observable outcomes instead of tokens, scopes, endpoints, pipelines, or provider internals.
- Trust boundaries are expressed where the user needs them: before connecting an account and before any action can affect an external app.
- Back navigation is always available after step one and must preserve completed connections.
- Success advances automatically after a short confirmation; failure stays in context and never silently skips a connection.
- The final screen hands the user into an active assistant empty state with useful prompts instead of ending at a setup receipt.

## State behavior shown

1. **Account:** default, creating, duplicate-address error, ready.
2. **Gmail:** ready, provider handoff, declined/failed connection, connected account.
3. **Calendar:** ready, calendar discovery, permission error, primary calendar selected.
4. **Notion:** connected workspace selection, shared-page loading, no-page recovery, destination confirmed.
5. **Workspace:** ready empty state, preparing handoff, partial integration recovery, first detected signal.

## Production guardrails for a later build

- Do not infer connection success from a closed provider window; verify it server-side.
- Preserve wizard position and completed connection state across refreshes.
- Make connection failures retryable and keep already-connected providers untouched.
- Support keyboard focus order, visible focus treatment, status announcements, and reduced-motion preferences.
- On narrow screens, stack the narrative panel above the setup card and keep the primary action within comfortable reach.

## Files

- `index.html` — complete flow map and high-fidelity screen gallery.
- `styles.css` — self-contained visual system and responsive layouts.
- `flow-map.svg` — standalone visual journey map for reviews or presentation use.
