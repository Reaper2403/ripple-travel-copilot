# Build control: frozen P0 and integration gates

**Authority:** This document is the build-time scope and handoff authority for the hackathon implementation. It resolves open product choices in the earlier documents. Machine-readable schemas remain authoritative for payload validation; where naming or product scope conflicts, this document and the accepted ADRs govern until all affected documents are corrected together.

**Frozen product:** Ripple turns one explicitly selected Gmail travel-disruption notice into an evidence-backed blast-radius assessment, two constrained response plans, one exact human approval, and a safely ordered recovery across **Notion, Google Calendar, and Gmail**.

## Decisions frozen for P0

| Decision | Frozen choice | Consequence |
|---|---|---|
| External apps | Gmail, Google Calendar, Notion | All three must have a meaningful real-provider read or write visible in the golden path. Google Docs is fallback only and is not named as the primary artifact in UI or demo copy. |
| Model | `gpt-5.6-terra`, configurable through `OPENAI_MODEL` | Model assists schema-constrained extraction and concise explanations. It never owns time math, policy, approval, or execution. |
| Product surface | One local web case workspace | No inbox, settings, chat, mobile, extension, add-on, or generic dashboard. |
| Trigger | Manual scan of `RIPPLE/READY` or one explicit demo fixture | No push subscription or mailbox-wide monitoring. |
| Disruptions | One cancellation golden path; simple delay in the bench | No hotel, rail, missed-connection, or live-status feature in the UI. |
| Calendar analysis | One bounded window, exactly two visible impacted commitments in the golden fixture | The deterministic impact rule uses instants plus IANA timezones and a fixed policy buffer. |
| Plans | Exactly two in the golden path | The recommended plan is `REMOTE_FIRST`; the alternative is `NOTIFY_ONLY`. Neither claims inventory, fares, or rebooking. |
| Approved effects | One Notion page upsert, one agent-owned Calendar hold upsert, one Gmail notification | No edit, move, or cancellation of a third-party event. No added effect after approval. |
| Recipient policy | Synthetic/public fixtures use allowlisted `@example.com` recipients; live mode uses only the configured real stakeholder allowlist | Unexpected recipients fail closed before preview and again before send. BCC is empty. Exact recipients are reviewable at approval, but may be masked in a public recording. |
| Execution order | Persist intent → Notion → Calendar → Gmail | A required failure stops later actions. Gmail is last and an unknown send outcome is never blindly retried. |
| Approval | One authenticated gesture bound to actor, case/plan version, plan and manifest hashes, source and Calendar snapshot hashes, expiry, and nonce | Editing, expiry, replay, or state drift invalidates the grant. |
| Persistence | Durable local case/action store; modular monolith | One process is acceptable. In-memory-only approval or idempotency is not. |
| Evaluation | Scripted adapters, fake clock, final-state diff, forbidden-call assertions | Reliability Bench is P0, not polish. Live smoke tests supplement rather than replace it. |
| Secrets | Real values only in untracked `.env.local` | Public files contain variable names, blank placeholders, and reserved `example.com` identities only. Never log or render secrets. |
| Public identity | Reserved `example.com` names and URLs | Schema `$id` values, fixture emails, callback examples, screenshots, and docs must not use personal or `.local` identities. |
| Demo truthfulness | Synthetic data is visibly marked; provider verification controls `Verified` | No pre-checked receipt, fabricated benchmark total, or static image presented as a live result. |

### Fixed golden fixture

- Operator: `operator@example.com`.
- Stakeholders: `stakeholder1@example.com` and `stakeholder2@example.com`.
- Source: a synthetic BER → SFO cancellation message in `RIPPLE/READY`.
- Impact: a 14:00 customer meeting is impossible; a 16:00 workshop lacks the fixed arrival buffer.
- Recommended response: create/update a Notion recovery brief, add one agent-owned disruption hold in Calendar, and send one approved notification to the two allowlisted stakeholders.
- Manual remainder: the traveler chooses and purchases replacement travel outside Ripple.

No public fixture may contain a real person, mailbox, API hostname owned by the team, reservation code, calendar ID, Notion page ID, or credential. Live-provider state may use configured real identities, but those values remain in `.env.local`/provider state, never source or fixtures.

## Builder boundaries

The **service builder** owns domain state, orchestration, persistence, adapters, model calls, policies, hashing, approval, execution, receipts, and bench behavior. The **UI builder** owns presentation, local interaction state, accessibility, and calls to the HTTP API. Neither builder may duplicate the other side's business rules.

### Service builder must provide

1. A versioned `RecoveryCase` read model composed only of canonical/provider-neutral fields.
2. Deterministic commands with optimistic case-version checks.
3. Durable approval consumption and action-intent journaling before any provider write.
4. Real demo adapters for Gmail read/send, Calendar read/write, and Notion page upsert/read verification.
5. Scripted adapters that implement the same ports and error categories.
6. An extraction call using `gpt-5.6-terra` with schema validation, evidence checking, timeout, output cap, and `store: false` where supported/configured.
7. Redacted structured errors; raw provider payloads, email bodies, tokens, attendees, and reservation references never cross to logs.
8. A repeatable reset/seed path that cannot target arbitrary provider resources.

The service builder must not return provider SDK objects, let a model generate executable actions after approval, accept a client-provided “approved=true” Boolean, or infer authorization from UI state.

### UI builder must provide

1. One no-scroll-at-demo-zoom case workspace showing the consequence headline, source evidence, two impacts, two plans, exact three-action preview, approval control, receipt rail, and safety strip.
2. All rendering from server-provided case/manifest/receipt data; no invented confidence, benchmark count, provider status, action count, or hash state.
3. Exact action names in order: **Notion**, **Google Calendar**, **Gmail**.
4. A single primary action appropriate to the server state; Approve is absent/disabled for stale, expired, ambiguous, executing, or terminal cases.
5. Immediate double-submit protection, while still relying on server idempotency.
6. Full recipients and message body at the approval boundary for the operator; masked addresses elsewhere and in public recordings where privacy requires it. Synthetic mode uses `example.com` identities throughout.
7. Synthetic/live labeling in the case header and Notion artifact.
8. Keyboard operation, visible focus, semantic controls, non-color status labels, and a polite live region for receipt changes.

The UI builder must not call providers directly, compute hashes or impact risk, locally advance execution status, say “Verified” without a verified receipt, use “Docs” for Notion, or imply Ripple bought/rebooked travel.

## HTTP API handoff contract

If the implementation already has equivalent route names, adapters may map to them; payload semantics and state guards below are fixed. All JSON fields use `snake_case`, timestamps are RFC 3339 UTC, and all mutating requests carry `expected_case_version`. Error responses use `{code, retryable, safe_message, trace_id}` and never expose a raw exception.

| Method and route | Request | Success response | Required guard |
|---|---|---|---|
| `POST /api/cases/demo` | `{scenario_id, expected_empty_demo_slot}` | `{case}` | Allowlisted scenario only; marks synthetic; idempotent seed. |
| `POST /api/cases/from-gmail` | `{message_id}` or `{label, limit: 1}` | `{case}` | Selected/labeled source only; bounded read; stable source fingerprint. |
| `POST /api/cases/{case_id}/analyze` | `{expected_case_version}` | `{case}` | Valid source; no write adapters; optimistic lock. |
| `GET /api/cases/{case_id}` | none | `{case}` | Redacted, provider-neutral read model. |
| `POST /api/cases/{case_id}/plans/{plan_id}/select` | `{expected_case_version}` | `{case, action_manifest}` | Plan belongs to current case version; manifest schema-valid. |
| `POST /api/cases/{case_id}/approve` | `{expected_case_version, plan_id, manifest_hash}` | `{case, approval_summary}` | Server recomputes every bound hash, actor, TTL, and nonce; no grant secret returned. |
| `POST /api/cases/{case_id}/execute` | `{expected_case_version}` | `{case, receipts}` | Atomically consume current grant and persist all intents before first provider call. |
| `POST /api/cases/{case_id}/retry` | `{expected_case_version}` | `{case, receipts}` | Retry unresolved safe actions only; reuse action/idempotency keys; reject Gmail `UNKNOWN`. |
| `POST /api/cases/{case_id}/replay-source` | `{expected_case_version}` | `{case, duplicate_summary}` | Same source yields same case and zero new provider effects. |
| `GET /api/bench/latest` | none | `{run_id, fixture_version, commit_ref, completed_at, passed, total, invariants[]}` | Result comes from a completed persisted run, never a UI constant. |

### Minimum case read model expected by UI

```json
{
  "schema_version": "1.0",
  "case_id": "case_demo_001",
  "case_version": 4,
  "mode": "SYNTHETIC",
  "status": "READY_FOR_REVIEW",
  "headline": "Flight cancelled → 2 commitments at risk",
  "source": {
    "app": "GMAIL",
    "provider_ref": "opaque",
    "source_version": "opaque",
    "received_at": "2026-09-13T10:00:00Z"
  },
  "facts": [],
  "impacts": [],
  "plans": [],
  "selected_plan_id": "plan_remote_first",
  "action_manifest": {},
  "approval_summary": null,
  "receipts": [],
  "allowed_commands": ["SELECT_PLAN", "APPROVE"]
}
```

`allowed_commands` is a server-derived affordance list. It improves UI correctness but is not authorization; every command is validated again server-side.

### UI state mapping

| Server state | Headline/support | Primary action | Forbidden UI behavior |
|---|---|---|---|
| `INGESTED` / `ANALYZING` | “Checking the notice and calendar…” | None | Never show approval or success. |
| `NEEDS_CLARIFICATION` | Name unsupported/contradictory facts | Correct or dismiss | No write-capable action. |
| `READY_FOR_REVIEW` | Show exactly two plans and complete manifest | “Approve these 3 actions” after plan selection | Do not hide recipient/body or unresolved manual work. |
| `APPROVED` | “Locked to this plan and calendar snapshot” | Execute | Do not permit edits without creating a new version. |
| `EXECUTING` | Current action plus prior receipts | None | No duplicate execution control; no optimistic checks. |
| `COMPLETED` | “Recovered · 3 verified” only if all three required receipts are verified | Open outputs / replay source | Never derive completion from HTTP 2xx alone. |
| `PARTIALLY_COMPLETED` | Name completed and blocked actions | Retry remaining, only if server allows | Never collapse to a toast or resend email blindly. |
| `NEEDS_MANUAL_REVIEW` | Explain unknown outcome and provider link | Open provider / mark reconciled if implemented | Never label failed or verified without evidence. |
| `REJECTED` | “No changes made” | None | No execute control. |

## Slice-by-slice acceptance gates

Work may proceed in parallel, but no slice is considered integrated until every gate in that row is demonstrated from the shared branch.

### Slice 0 — contract and safety spine

**Deliver:** schemas load, canonical hashing is shared, state transitions reject skips, durable case/action store works, fake ports compile, configuration validates.

**Gate:**

- One fixture transitions `INGESTED → ANALYZING → READY_FOR_REVIEW` through the orchestrator.
- A direct `READY_FOR_REVIEW → EXECUTING` transition is rejected.
- The same semantic manifest produces the same 64-character hash in service tests and any UI fixture tooling.
- Invalid schema examples fail and public schema `$id` values use reserved `example.com` identity.
- Repository secret scan is clean; `.env.local` is ignored; model default is `gpt-5.6-terra`.

### Slice 1 — evidence-backed read path

**Deliver:** one bounded Gmail source read or demo fixture, model extraction, deterministic evidence gate, bounded Calendar snapshot, impact assessment, read-only API/UI.

**Gate:**

- Golden cancellation yields supported facts and exactly two explained impacts.
- Each critical fact has a source reference, excerpt, and confidence.
- The source message is treated as untrusted data; injected instructions cannot affect recipients or policy.
- Missing timezone/contradiction transitions to `NEEDS_CLARIFICATION` with zero writes.
- No read or model call logs raw content or secrets.

### Slice 2 — plans and exact approval

**Deliver:** two constrained plans, canonical three-action manifest, exact preview, server-issued approval bound to current snapshots.

**Gate:**

- UI preview and executor input are the same manifest and hash.
- Golden plan contains exactly `ARTIFACT_UPSERT`, `CALENDAR_HOLD_UPSERT`, and `MAIL_SEND` in that order.
- Synthetic mode recipients are the two allowlisted `@example.com` identities. Live mode recipients exactly match the configured real stakeholder allowlist. BCC is empty in both modes.
- Any manifest edit, Calendar/source drift, expiry, actor mismatch, or replayed nonce invalidates approval with zero writes.
- Double approval yields one grant/consumption path.

### Slice 3 — real three-app saga

**Deliver:** Notion upsert and verification, agent-owned Calendar hold upsert and verification, Gmail send and receipt reconciliation, durable journal, partial-failure UX.

**Gate:**

- A live test produces one case-owned Notion page, one agent-owned Calendar hold, and one sent Gmail message, each with a provider reference.
- Intents are durable before the first provider request.
- Full workflow replay produces no additional page, event, or email.
- Injected Notion failure produces no Calendar/Gmail call.
- Injected Calendar failure after Notion success produces no Gmail call and a resumable partial state.
- Gmail timeout after request transmission becomes `UNKNOWN` and cannot auto-retry.

### Slice 4 — reliability proof

**Deliver:** minimum eight deterministic scenarios, fake clock, injected provider faults, full final-state diff, forbidden-call assertions, persisted scorecard.

**Gate:**

- Required scenarios cover golden path, irrelevant message, ambiguous facts, duplicate/replay, stale approval, concurrent execute, Notion failure, and Calendar failure/email suppression.
- All ten invariants in `docs/05-testing-plan.md` pass.
- Scorecard is tied to fixture version and code/commit reference.
- A failed assertion makes the run fail even if the final UI appears successful.
- At least one live read/write smoke test passes for every committed app.

### Slice 5 — demo hardening

**Deliver:** reset/seed, stage-like UI, provider links, saved verified bench run, backup recording, two-minute rehearsal.

**Gate:**

- Three consecutive clean rehearsals finish in at most 1:50.
- Reset targets only the dedicated demo label/calendar/Notion parent and removes only app-owned artifacts.
- No personal notification, tab, address, ID, or secret appears on screen.
- The main screen names Gmail, Google Calendar, and Notion consistently.
- Replay visibly reports zero new actions based on provider-state comparison.

## Scope cut order

Cut from the top of this list as time slips. A cut means remove the promise from UI, docs, fixtures, and narration together.

1. Styling beyond the stage-like single-screen minimum.
2. Correction form; retain safe `NEEDS_CLARIFICATION` refusal.
3. User-editable plan text; use fixed validated drafts.
4. More than the two fixed plans.
5. Delay support in the live UI; retain as a bench fixture only.
6. Provider receipt deep links; retain opaque verified receipt text.
7. Live Gmail send, **only if necessary**: fall back to a real Gmail draft and change manifest/UI/demo wording from Send to Create draft everywhere.
8. Google Docs fallback adapter; it is never on the critical path.

Never cut: real Gmail input, real Calendar read/write, real Notion write, source evidence, deterministic impact math, exact approval, durable action intents, idempotency, failure ordering, duplicate replay, the high-signal reliability bench, or truthful synthetic/live labeling. If one committed app is not real by demo freeze, the team must describe the demo as degraded rather than imply otherwise.

## Two-minute demo acceptance checklist

### Before recording

- [ ] Real `.env.local` exists only on the demo machine and is excluded from source control.
- [ ] `OPENAI_MODEL=gpt-5.6-terra` passes a schema-constrained health check.
- [ ] Google refresh, Gmail label read, Calendar bounded read/write, and Gmail controlled send/draft health checks pass.
- [ ] Notion parent is explicitly shared with the integration; create/read/update health checks pass.
- [ ] Golden Gmail, Calendar, and Notion data use synthetic `example.com` identities and are visibly labeled.
- [ ] One completed bench result is tied to the current fixture/code version.
- [ ] Provider tabs are pre-opened; personal tabs and notifications are closed.
- [ ] Reset has been run, then the exact path rehearsed three times under 1:50.

### During the two minutes

- [ ] By 0:10, audience sees “Flight cancelled → 2 commitments at risk” and Gmail as source.
- [ ] By 0:28, exact evidence and both deterministic impacts are visible.
- [ ] By 0:45, two coordination plans are shown and manual rebooking is explicit.
- [ ] By 1:03, exact Notion, Calendar, and Gmail effects and recipients are visible; one approval gesture occurs.
- [ ] By 1:25, receipt rail shows real order and verification: Notion → Calendar → Gmail.
- [ ] By 1:40, the real provider outputs or provider-backed receipt links are shown.
- [ ] By 1:54, replay reports zero new effects and the saved bench names stale-approval and partial-failure checks.
- [ ] By 2:00, final frame says “Recovered · 3 verified · 0 duplicates” only if evidence supports all three numbers.

### Immediate rejection conditions

- UI or narration says Google Docs when the action is Notion.
- The demo implies travel was rebooked or a fare is live.
- Approval does not expose exact recipients and actions.
- A success checkmark is animated before provider verification.
- Benchmark totals are constants or screenshots disconnected from a versioned run.
- Replay creates any duplicate provider object/message.
- A real or non-`example.com` identity appears in public files or the recording.

## Risk and blocker register

| ID | Risk/blocker | Trigger | Owner | Required response | Severity/status |
|---|---|---|---|---|---|
| R-01 | Notion integration lacks parent access | Read/create health check returns permission/not found | Service builder | Share dedicated parent with internal integration; verify create/read/update before saga work | Critical · dependency verified; implementation smoke still gated |
| R-02 | Google OAuth callback/scope failure | Consent, callback, refresh, or API health check fails | Service builder/user | Fix exact callback and test-user setup; isolate auth work while fake-path integration continues | Critical · scopes/APIs verified; adapter smoke still gated |
| R-03 | Public identity leakage | Secret scan or `rg` finds personal identity in source/public fixtures or a non-example schema ID | Both/reviewer | Keep live identities in `.env.local`/provider state; use reserved examples publicly; rotate any leaked credential; rerun scan | Critical · schema issue resolved; continuous scan required |
| R-04 | Notion/Docs naming drift | UI, test, or narration labels P0 artifact “Docs” | UI builder/docs owner | Rename to Notion or provider-neutral Artifact; keep Docs only in fallback notes | High · primary demo/test docs resolved; minor generic references remain in docs 04/11 |
| R-05 | Contract drift between builders | UI fixtures or service DTOs add/rename fields independently | Both | Stop integration; update schema/ADR/examples/conformance tests as one change | High · monitored |
| R-06 | Approval is cosmetic | Execute accepts client Boolean or stale manifest | Service builder | Block slice; implement server-bound grant and negative tests before writes | Critical · gate |
| R-07 | Idempotency is process-local | Restart/replay duplicates an effect | Service builder | Persist source/action keys and provider refs; add crash/restart replay | Critical · gate |
| R-08 | Gmail outcome ambiguity | Timeout occurs after request transmission | Service builder | Mark `UNKNOWN`; reconcile/manual review; never blind retry | Critical · gate |
| R-09 | Model invents travel facts or recipients | Output lacks evidence or adds unapproved address/action | Service builder | Schema/evidence/allowlist rejection; `NEEDS_CLARIFICATION`; zero writes | Critical · gate |
| R-10 | Timezone/impact disagreement | UI and backend calculate different severity/time | Both | Backend alone calculates; UI renders supplied rule/instants; add DST fixture | High · gate |
| R-11 | Demo runs long or requires scrolling | Rehearsal exceeds 1:50 or presenter navigates UI | UI builder/PM | Apply cut order; pre-analyze case; keep only two impacts, two plans, three actions | High · open until rehearsed |
| R-12 | Reliability proof becomes decorative | Bench ignores unexpected calls or uses fixed pass total | Service builder | Diff full provider state; assert forbidden calls; persist versioned run | Critical · gate |
| R-13 | Real provider outage on stage | Health check fails or action exceeds five seconds | PM/demo owner | Show fail-closed state honestly; use saved real receipts/backup run; do not fabricate live completion | Medium · contingency |
| R-14 | Gmail sending is unsafe/unavailable | Send permission or reconciliation remains unstable at freeze | PM/service builder | Invoke cut 7: switch contract, UI, tests, and narration consistently to Gmail draft creation | High · decision at demo freeze |
| R-15 | UI fabricates provider/bench success | UI timers or constants mark actions verified, replay safe, or scenarios passed | UI builder/service builder | Replace with service-returned receipts and persisted bench result; keep static view data explicitly synthetic during development | Critical · presently observed; blocks demo |

## Demo-freeze review: corrections required

Completed during the build-control audit: P0-facing Docs wording in the primary testing/demo/decision documents was corrected to Notion; schema `$id` values now use `ripple.example.com`; live Notion parent access and required Google APIs/scopes were verified.

Before the build can be called demo-ready:

1. Clean the remaining generic Docs wording in docs 04/11 or label it explicitly provider-neutral/fallback.
2. Confirm the UI and service use the same manifest bytes/hash and status enums; remove any duplicate client-side domain calculation.
3. Remove timer-driven or hard-coded provider verification, replay counts, receipt times, and benchmark totals from the integrated UI. All must come from service receipts or a persisted versioned bench run.
4. Prove server-side stale approval rejection and durable replay idempotency after a process restart.
5. Prove the live Notion → Calendar → Gmail order with provider-backed receipts and an injected Calendar failure that suppresses email.
6. Scan public files and the public demo/recording surface for real identities, secrets, provider IDs, or reservation data. Live real identities may exist only in local configuration/provider state and must be masked in the public recording when needed.
7. Freeze Gmail behavior as either `MAIL_SEND` or a consistently renamed draft action; do not claim one while demonstrating the other.

Feature work stops once these corrections are the remaining work. They are the product.
