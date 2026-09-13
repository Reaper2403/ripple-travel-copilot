# Ripple — Travel Disruption Copilot

Ripple turns a travel-disruption email into a safe, reviewable recovery workflow across Gmail, Google Calendar, and Notion. It extracts the disruption with evidence, finds downstream commitments at risk, proposes ranked response plans, previews every side effect, requires explicit approval, then executes an idempotent saga and shows receipts.

> Hackathon scope: Ripple coordinates the consequences of disrupted travel. It does **not** buy or rebook travel in the MVP. Booking links and a provider-neutral travel adapter are future extensions.

## Why this scope

- **Useful:** one delayed or cancelled trip can invalidate meetings, attendee expectations, and an itinerary.
- **Multi-step and agentic:** extraction, impact analysis, constrained planning, approval, multi-app execution, verification, and recovery are distinct decisions.
- **Safe to demonstrate:** writes are previewed; stale approvals fail closed; retries cannot duplicate actions.
- **Evaluable:** Ripple Bench measures both final state and forbidden side effects under ambiguity, retries, stale data, and provider failures.
- **Buildable in one hackathon day:** the golden path uses one Google OAuth client, one Notion internal connection, and three user-facing apps; optional integrations remain behind ports.

## Document map

| Start here for… | Document |
|---|---|
| Product thesis, users, scope, feature backlog | [Product scope](docs/01-product-scope.md) |
| Incremental implementation and demo plan | [Build plan](docs/02-build-plan.md) |
| System, state machine, data and trust boundaries | [Architecture](docs/03-architecture.md) |
| Screens, flows, copy and accessibility | [UX brief](docs/04-ux-brief.md) |
| Scenarios, edge cases, evals and release gates | [Testing plan](docs/05-testing-plan.md) |
| Every required API, permission and setup step | [Integrations and auth](docs/06-integrations-and-auth.md) |
| Canonical contracts for independent implementers | [Module contracts](docs/07-module-contracts.md) |
| Judging criteria and evidence checklist | [Judging scorecard](docs/08-judging-scorecard.md) |
| Scope trade-offs and settled decisions | [Decision log](docs/09-decisions.md) |
| Two-minute story, screen choreography, and narration | [Demo plan](docs/10-two-minute-demo.md) |
| Real-world product form, utility strategy, and hackathon cut | [Product form and utility](docs/11-product-form-and-utility.md) |
| Current build, test, and live-integration readiness | [Integration report](reports/integration-test-report.md) |
| Seed, maintain, reset, and auto-label the demo | [Demo operations](docs/13-demo-operations.md) |

Machine-readable contract seeds live in [`contracts/`](contracts/). Every implementation module must consume or produce these canonical shapes rather than inventing its own variants.

## Run it

Use Node 24, copy `.env.example` to `.env.local`, and keep that local file out of version control. Then run:

```bash
npm install
npm run preflight
npm test
npm run dev
```

`npm run preflight` performs read-only checks against Google OAuth, the Gmail ingest label and demo message, the configured Calendar, the Notion parent page, and the selected OpenAI model. It reports readiness without printing credentials or personal identifiers.

The app defaults to synthetic providers. Set `PROVIDER_MODE=real` only for the controlled live demo after the preflight passes. Reset a synthetic demo case with `POST /api/cases/demo` and `{ "scenario": "cancellation" }`.

If demo fixtures are missing, `npm run seed:demo` idempotently creates a 19-event executive week without attendee notifications and ensures the synthetic disruption notice exists. `npm run fixtures:watch` maintains those fixtures every 60 seconds. `npm run reset:demo` removes only Ripple-owned Calendar fixtures and recovery holds, preserving all pre-existing events. See [demo operations](docs/13-demo-operations.md).

## P0 demo story (two minutes)

1. A synthetic airline cancellation appears in a dedicated Gmail label.
2. Ripple cites the exact email facts and highlights two calendar commitments at risk.
3. The user compares two recovery plans and sees exact proposed changes.
4. The user approves one immutable plan.
5. Ripple creates/updates the recovery page in Notion, applies one safe Calendar change, then sends one Gmail message last.
6. Receipts prove each result; Ripple Bench shows the same workflow surviving duplicate input, stale approval, and an injected provider failure.

## Definition of done

The P0 submission is done only when the golden path works against the real three apps, the same inputs replay without duplicate side effects, stale approval is rejected, the core benchmark passes its release thresholds, and the two-minute demo can be reset and rerun from seeded data.
