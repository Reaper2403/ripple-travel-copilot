# Incremental build plan

## Build strategy

Each increment ends in a demonstrable vertical slice and freezes a contract version. Parallel agents may work behind ports, but integration happens only through the canonical schemas in [`contracts/`](../contracts/).

### Increment 0 — freeze the spine (30–45 minutes)

**Deliver:** repository skeleton, config validation, canonical schemas, state transitions, fake ports, fixture loader, redacted structured logging.

**Exit:** a fixture can move a `RecoveryCase` from `INGESTED` to `READY_FOR_REVIEW` using only fakes; invalid transitions and invalid payloads fail.

### Increment 1 — evidence and impact, read-only (60–75 minutes)

**Deliver:** Gmail selected-message adapter; structured extraction; evidence/confidence gate; Calendar window reader; timezone-normalized impact rules; read-only review screen/CLI.

**Exit:** three fixture types (cancellation, delay, ambiguous notice) show cited facts and correct impacted events; no write credentials are exercised.

### Increment 2 — planning and immutable approval (45–60 minutes)

**Deliver:** deterministic plan constraints; model-assisted ranking/explanation; canonical `ActionManifest`; human-readable diff; source/manifest hashes; approval TTL and stale-state revalidation.

**Exit:** approval succeeds for an unchanged snapshot and is rejected after any source event or action mutation.

### Increment 3 — three-app write saga (75–90 minutes)

**Deliver:** Notion artifact adapter; Calendar mutation adapter; Gmail draft/send adapter; idempotency store; receipts; resume/retry remaining actions.

**Exit:** real sandbox/test accounts complete Notion → Calendar → Gmail; replay creates zero duplicates; an injected Calendar failure prevents Gmail send and preserves a retryable case.

### Increment 4 — Ripple Bench and observability (60 minutes)

**Deliver:** scenario manifest, fake provider simulator, latency/rate-limit/auth/timeouts, trace assertions, scorecard, forbidden-effects checks, PII redaction tests.

**Exit:** all P0 release gates in the testing plan pass locally from one command; failed scenarios explain expected versus observed state.

### Increment 5 — demo hardening (45–60 minutes)

**Deliver:** seeded real-account demo, reset checklist, loading/error states, concise copy, two-minute script, backup recording/screenshots, system/reliability brief.

**Exit:** three consecutive rehearsals finish in two minutes, from a clean seed, without manual repair.

## Scope cut order

If time is short, cut in this order: Google Docs fallback adapter → editable plan → multiple stakeholder groups → Calendar event move → polished template. Never cut the Notion P0 adapter, source evidence, approval binding, idempotency, receipts, stale-state checks, the benchmark, or real integration with all three committed apps.

## Work packages and ownership contracts

| Package | Owns | Consumes | Produces | Must not own |
|---|---|---|---|---|
| `domain` | Types, invariants, state machine | Nothing provider-specific | Validated domain objects/errors | OAuth, HTTP, UI |
| `ingest-gmail` | Message retrieval/normalization | `TriggerRequest` | `SourceMessage` | Extraction or writes |
| `extractor` | Fact extraction/evidence gate | `SourceMessage` | `DisruptionFacts` | Provider access |
| `impact-engine` | Temporal feasibility | Facts + normalized events + policy | `ImpactAssessment` | LLM-only calculations |
| `planner` | Candidate plans and manifests | Facts + impact + policy | `RecoveryPlan[]` | External writes |
| `approval` | Hashing, TTL, actor, snapshot validation | Manifest + snapshot | `ApprovalGrant` | UI or provider logic |
| `executor` | Saga order, idempotency, retries | Grant + manifest + ports | `ExecutionReceipt` | Content generation |
| provider adapters | API translation/error mapping | Port request | Port response | Business decisions |
| `bench` | Fixtures, faults, assertions, score | Scenario contract | Test evidence | Production secrets |
| UI | Presentation and user intent | View models | Commands | Provider calls directly |

## Integration rules for multiple implementation agents

1. Pin `schema_version: "1.0"`; breaking changes require an ADR and fixture updates.
2. Use UTC instants internally plus original IANA timezone; never pass locale-formatted timestamps across modules.
3. IDs are opaque strings. Never infer provider/type from an ID prefix.
4. Return typed errors with `code`, `retryable`, `safe_message`, and redacted `details`.
5. Every write receives `case_id`, `action_id`, `idempotency_key`, `expected_snapshot_hash`, and `dry_run`.
6. Adapters report provider IDs and verification state; they never silently coerce or “fix” invalid domain data.
7. The executor alone controls write order. UI/planner cannot call write adapters.
8. Fakes must implement the same ports and contract tests as real adapters.

## Handoff checklist per module

- Contract and examples pass schema validation.
- Unit tests cover success, validation failure, retryable failure, and terminal failure.
- Logs contain case/action IDs but no raw email body, tokens, or reservation code.
- Timeout and retry budget are explicit.
- Idempotency behavior is documented and tested.
- Fake and real adapter pass the same contract suite.
- README includes setup, limitations, and one local smoke test.

## Demo runbook

1. Reset the dedicated label, calendar, and Notion demo parent page.
2. Load fixture `cancelled-flight-two-meetings`.
3. Show the source evidence and affected calendar events.
4. Compare “remote-first” and “move commitments” plans.
5. Approve the remote-first plan; show the immutable diff/hash cue.
6. Execute and open the Notion recovery page, Calendar receipt, and sent email.
7. Run or reveal benchmark cases for duplicate delivery, stale approval, and Calendar rate limit.
8. Close on the scorecard: useful action plus proof of forbidden effects remaining zero.
