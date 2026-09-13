# Ripple v2 integration test log

**Owner:** Dedicated integration tester  
**Scope:** Test files and test documentation only; no production implementation changes  
**Safety:** Real-provider checks must redact identities, event contents, tokens, and provider payloads.

## Baseline — 2026-09-13

### Repository and contract review

- Reviewed `docs/15-v2-build-plan.md`, `planning/v2/reconciliation.md`, and the v1 module contracts.
- Confirmed the v1 safety spine requires immutable manifests, explicit approval, journal-before-write, Notion → Calendar → Gmail ordering, verified receipts, and no blind retry after an unknown Gmail outcome.
- Confirmed v2 adds truthful server-verified onboarding, read-only conversational analysis, versioned proposals, exact confirmation, Ripple-owned Calendar blocks, and an idempotent Notion follow-through tracker.
- Existing working tree contains uncommitted v2 planning/design artifacts. The test lane will not overwrite or commit another agent's work.

### Commands and results

| Command | Result | Notes |
|---|---|---|
| `npm test -- --reporter=verbose` | **Failed: 40 passed, 1 failed** | All domain, schema, persistence, adapter, benchmark, and approval/execution tests passed. Repository hygiene failed on a planning document. |
| `npm test -- --reporter=verbose` after IT-001 correction | **Passed: 41/41** | Seven test files green. |
| `npm run lint` | **Passed** | TypeScript completed with no errors. |
| `npm run build` | **Passed** | Next.js production build completed; v1 routes generated successfully. |
| `npx vitest run tests/v2-contracts.test.ts --reporter=verbose` | **Passed: 12/12** | Added strict schema, fixture-redaction, opaque Calendar selection, verified-state, onboarding-store, safe failure, full fixture flow, and concurrency coverage. |
| `npm test -- --reporter=dot` after first v2 server slice | **Passed: 55/55** | Eight files green, including 14 v2 contract/service tests. |
| `npm run lint` after first v2 server slice | **Passed** | V2 contracts, service, routes, and frontend consumer types compile together. |
| Isolated fixture HTTP flow on port 3101 | **Passed** | Verified secure session cookie, strict request rejection, unknown-session denial, Gmail/Calendar/Notion states, opaque Calendar IDs, Notion create capability, and onboarding completion. No real provider was called. |
| In-app browser fixture journey | **Passed after IT-008 fix** | Completed all five onboarding screens, three connection checks, Screen 5 handoff, live read-only `Prepare my week`, option selection/refinement, and typed `yes` safety behavior. No dead primary control found. |
| 390 px workspace check | **Passed** | No horizontal overflow (`scrollWidth === clientWidth`); core connection, analysis, option, and composer content remained present. |
| Full post-conversation gate: test / lint / build | **Passed: 67/67** | Ten test files green; TypeScript and production build pass; 26 routes/pages generated including all v2 onboarding and conversation paths. |
| `npm run preflight` | **Passed: 7/7** | Configuration, local security, Google OAuth scopes, Gmail fixture, Calendar fixture, Notion parent read, and selected OpenAI model are ready; output was capability-only. |
| Real-provider v2 onboarding HTTP gate | **Blocked at Calendar options** | Gmail verification passed without exposing identity. Calendar options returned a safe 500 under the current grant; Notion was not reached and no provider write occurred. |
| Real-provider v2 retest after Calendar fallback | **Passed** | All eight product routes, seven onboarding endpoints, and three conversation operations passed. Gmail/Calendar/Notion were provider-verified; public session projection and read-only DRAFT proposal safety passed. Output contained no identity or secret. |
| Final post-fallback test / lint / build / diff check | **Passed: 68/68** | Ten test files, TypeScript, 26-route production build, and whitespace validation are green. |
| `npx vitest run tests/v2-proposal-contracts.test.ts --reporter=verbose` | **Passed: 6/6** | Locks draft/actionable state separation, selected-option membership, Notion-first ordering, one-action-per-provider, Calendar interval/timezone safety, BCC prohibition, and strict fields. |

### Defects

#### IT-001 — Public hygiene rejects provider-domain identity example

- **Severity:** Release blocker for a public repository
- **Location:** `planning/v2/product-manager.md`
- **Observed:** The document contains a masked address using a personal email provider domain. `tests/repository-hygiene.test.ts` correctly treats any such domain in public files as an identity-leak risk.
- **Expected:** Documentation uses reserved-domain or provider-neutral examples only.
- **Owner notified:** Root integration owner and usability checker.
- **Status:** Resolved. The example was replaced and the complete suite passed.

## V2 test matrix

These suites will be added as the corresponding frozen contracts and modules land.

| Area | Required evidence |
|---|---|
| Contract compatibility | Positive/negative fixtures; schema version; unknown-field policy; normalized safe errors |
| Onboarding truth | Client cannot manufacture `verified`; refresh resumes; wrong account, missing permission, and provider failure map to `needs_attention` |
| Read-only assistant | Prompt, starter selection, option selection, typed approval, and rejection invoke zero writer calls |
| Proposal safety | Actor, version, expiry, manifest hash, and source/calendar snapshot binding; mutation and replay rejected |
| Notion tracker | Non-empty tracker; stable page/task markers; no duplicate page/tasks; human blocks and manual checkbox changes preserved |
| Execution ordering | Intents durable before calls; Notion failure suppresses Calendar/Gmail; Calendar failure suppresses Gmail; Gmail unknown is not retried |
| Calendar ownership | Only new Ripple-owned blocks are writable; third-party and existing events remain read-only |
| API/UI integration | Normalized states only; no raw tokens/provider payloads; no optimistic success; receipts required before completion |
| Accessibility | Keyboard flow, focus restoration, live status, reduced motion, and 390 px layout |
| Operations | Seed/reset limited to marked fixtures and restores exact Calendar baseline |

## Coordination notes

- Tests should import public v2 contracts rather than duplicate DTO shapes.
- Shared fixtures must use `example.com` identities and synthetic event content.
- Real-provider preflight is opt-in and must report only capability booleans and safe error categories.
- No real-provider write test may run from the default unit-test command.

## Contract review findings

### IT-002 — Public DTO strictness and verified-state invariants

- **Severity:** High; must close before onboarding endpoints are considered frozen.
- **Observed:** Initial Zod objects strip unknown keys rather than rejecting them. A malformed payload containing a secret-shaped/provider-only field could therefore appear accepted even though the field is omitted from parsed output. The initial connection schema also permits `verified` without verification timestamps and permits incomplete capabilities.
- **Expected:** Public request/response objects reject unknown keys. A `verified` connection requires trustworthy verification metadata and complete required capabilities; an attention state carries a safe user-facing error. Onboarding connection keys must match their provider values.
- **Owner notified:** Backend worker.
- **Status:** Resolved. Strict public DTOs and verified/completed-state refinements landed; negative tests pass.

### IT-003 — Notion setup verifies read access but not tracker creation capability

- **Severity:** High for the real-provider golden path.
- **Observed:** The initial real verifier retrieves the configured parent and bot identity, then reports only `notion.page.read`. It does not prove that Ripple can create the promised follow-through tracker beneath that destination.
- **Expected:** Setup verifies the capability needed for the v2 write path using a safe/reversible probe or an equivalent provider permission signal before showing the destination as ready for trackers.
- **Owner notified:** Backend worker.
- **Status:** Resolved. The real verifier now creates a minimal child page, archives it immediately, confirms cleanup, and reports read/create capabilities only after both checks succeed. Fixture and HTTP gates assert the new capability.

### IT-004 — Calendar metadata accessible to an unrecognized session

- **Severity:** High privacy boundary.
- **Observed:** The first Calendar-options service signature did not validate the supplied session, so the route could reach the provider for any non-empty cookie.
- **Expected:** Resolve and validate the server-owned session before listing any provider calendar metadata, and require the prior Gmail setup step.
- **Status:** Resolved. Service authorization and onboarding-order regressions pass.

### IT-005 — Hygiene test treated a Google OAuth scope as a personal identity

- **Severity:** Test defect.
- **Observed:** The domain-only pattern matched the official `mail.google.com` OAuth scope even though no email address was present.
- **Expected:** Match an email-shaped local-part plus a personal-provider domain.
- **Status:** Resolved in the test; the complete suite passes while real personal addresses remain rejected.

### IT-006 — Expired or unhealthy connections can still appear connected

- **Severity:** Critical truthfulness boundary.
- **Observed:** The initial session read returns stored verified summaries after `valid_until`. The workspace connection strip derives its label from `verification_mode` without checking `status`, so an expired or `needs_attention` integration could still appear connected.
- **Expected:** Session load expires or revalidates stale summaries, and every UI connection label is status-aware. Workspace access/health must not imply readiness unless all three connections are currently verified.
- **Owners notified:** Backend worker and root/frontend owner.
- **Status:** Resolved. Session reads expire stale summaries and invalidate workspace completion. UI readiness and labels now require current `verified` state; service/UI regressions pass.

### IT-007 — Frontend duplicates shared onboarding DTOs

- **Severity:** Medium integration drift risk.
- **Observed:** `components/v2/types.ts` re-declares provider, connection, onboarding, and Calendar option types rather than consuming the inferred types from `src/lib/v2/contracts.ts`.
- **Expected:** Frontend re-exports/imports the server-neutral public contract types and keeps only view-specific assistant types locally.
- **Owner notified:** Root/frontend owner.
- **Status:** Resolved. Frontend now imports/re-exports server-neutral inferred public contract types.

### IT-008 — Calm schedule described as an attention item

- **Severity:** Medium product-trust defect.
- **Observed:** A live fixture result said `1 item deserve attention` while its only insight said there was no immediate pressure.
- **Expected:** Informational fallbacks do not count as attention; grammar agrees for zero, singular, and plural counts.
- **Status:** Resolved. Browser retest shows `No items need attention`; a calm-week unit regression passes.

### IT-009 — HttpOnly session identifier exposed in public DTOs

- **Severity:** Critical session boundary.
- **Observed:** Initial onboarding and conversation responses included the server session UUID as `session_id`/`user_id`, undermining the HttpOnly cookie boundary.
- **Expected:** Internal persistence may retain the identifier, but public response views omit it everywhere.
- **Status:** Resolved. Dedicated public projections and strict schemas omit the identifier; regression assertions and the full gate pass.

### IT-010 — Handoff prompt repeats after a hard refresh

- **Severity:** Medium persistence/noise defect.
- **Observed:** The first Screen 5 URL retained its prompt query after auto-submit, so reloading created another conversation and repeated the analysis.
- **Expected:** Consume the one-time handoff prompt and replace the address with `/workspace` before future reloads.
- **Status:** Resolved. The workspace now removes the prompt query after claiming it.

### IT-011 — Development-only smooth-scroll warning

- **Severity:** Low; not a functional or release blocker.
- **Observed:** Next.js development mode recommends declaring `data-scroll-behavior="smooth"` on the root `<html>` when global smooth scrolling is enabled.
- **Expected:** Add the framework hint if the team wants a warning-free development console.
- **Status:** Open polish item; production build is green.

### IT-012 — Current Google grant cannot list selectable calendars

- **Severity:** Real-provider release blocker.
- **Observed:** The credential-safe preflight and Gmail v2 verification pass, and direct Calendar event reads are ready. The v2 Calendar-options endpoint returns 500 when it attempts to list calendars under the current grant.
- **Expected:** Either use a narrow, provider-verified configured-calendar fallback compatible with the existing Calendar-event grant, or explicitly require and preflight the additional Calendar-list scope. The UI must not invent a calendar identity or writable status.
- **Owners notified:** Backend worker and root integration owner.
- **Status:** Resolved. Discovery remains preferred; when CalendarList is unavailable the adapter verifies the configured calendar through provider-returned event metadata, requires a provider summary and writable access role, exposes one opaque option, and fails closed otherwise. Real onboarding and conversation reads pass.

## Release assessment

### Shippable now: v2 Increments 0–2

- Shared strict contracts and public/internal projections.
- Five-screen onboarding and responsive Screen 5 workspace.
- Real or explicitly labeled fixture connection verification.
- Provider-compatible Calendar fallback with no invented identity.
- Read-only bounded schedule analysis, recent-change review, structured options, refinement, and typed-approval safety.
- Preserved v1 disruption review route.

### Shippable now: v2 Increments 3–5

- Versioned proposal selection, rejection, exact confirmation, and execution endpoints.
- Notion-first immutable manifests, followed by Calendar only after the required tracker succeeds.
- Explicit confirmation boundary; typed approval, selection, rejection, tamper, expiry, and stale inputs remain write-free.
- Atomic approval/execution transitions, a renewable execution lease, immutable reviewed hashes, durable receipts, and safe retry suppression.
- Idempotent Notion tracker reconciliation with pagination, stable markers, read-back verification, and preservation of human-authored blocks and checkbox state.
- Screen 5 exact preview, terminal/partial presentation states, provider receipt normalization, and safe external links.

### Explicitly deferred by the approved v2 scope

- Self-service multi-user Google/Notion OAuth and account switching.
- Editing, moving, or cancelling existing meetings.
- Natural-language-only approval, arbitrary tool use, and inferred recipients.
- Two-way Notion synchronization and durable cloud Gmail push workers.

## Increments 3–5 audit

The following issues were found during implementation and sent to the responsible builder. They remain open until focused service/UI regressions and the full suite pass.

### IT-013 — Approval consumption and execution state were not atomic

- **Severity:** Critical crash/replay safety.
- **Observed:** Initial execution consumed approval and transitioned the proposal in separate durable writes. It also had no safe resume path from `EXECUTING` or `PARTIALLY_COMPLETED`.
- **Expected:** Approval consumption and transition to `EXECUTING` are atomic; safe journal states resume under the same manifest while unknown/non-retryable outcomes stop for manual review.
- **Status:** Resolved. Approval consumption and `APPROVED` → `EXECUTING` now occur atomically; focused failure/resume tests pass.

### IT-014 — Approval and receipt hashes diverged across mutable statuses

- **Severity:** Critical audit integrity.
- **Observed:** Proposal hashes include version/status. Initial receipts used a newly computed `EXECUTING` hash instead of the exact reviewed hash stored with approval.
- **Expected:** Approval and every execution receipt bind to the same immutable reviewed proposal/manifest content hash.
- **Status:** Resolved. Every receipt is asserted against the exact reviewed proposal hash; the focused regression passes.

### IT-015 — Execution did not revalidate Calendar freshness

- **Severity:** Critical stale-plan safety.
- **Observed:** Calendar freshness was checked at confirmation but not immediately before the first provider write.
- **Expected:** Revalidate before atomic approval consumption; a mismatch invalidates the proposal with zero intents/writes.
- **Status:** Resolved. The execution-time check durably invalidates on drift before creating intents or provider writes; the focused regression passes.

### IT-016 — Refinement leaves the superseded proposal confirmable

- **Severity:** Critical approval/versioning boundary.
- **Observed:** `Refine plan` starts a new message/proposal but the prior `READY_FOR_REVIEW` proposal remains valid until expiry.
- **Expected:** Submitting the refinement explicitly invalidates the superseded actionable proposal before presenting a replacement.
- **Status:** Resolved. Refinement carries the superseded proposal reference, invalidates the prior proposal, and the old hash/version can no longer confirm; the focused regression passes.

### IT-017 — Terminal proposal states can map back to a ready confirmation UI

- **Severity:** Critical UI safety.
- **Observed:** Initial frontend presentation mapping defaulted `COMPLETED`, `PARTIALLY_COMPLETED`, and `NEEDS_MANUAL_REVIEW` to `ready`.
- **Expected:** Terminal/partial/manual states never enable confirmation and render persisted result/attention state after refresh.
- **Status:** Resolved for safety. Every terminal/uncertain state has an explicit non-ready mapping and the unit regression passes. Restoring the last conversation after a full page refresh remains a deferred continuity improvement, not a confirmation bypass.

### IT-018 — Tracker reconciliation could duplicate or falsely verify pages

- **Severity:** Critical idempotency and receipt truth.
- **Observed:** Initial adapter relied on eventually-consistent title search, did not persist/read stable task markers, returned success for partial content, and lacked pagination.
- **Expected:** Enumerate safely with pagination, use stable tracker/task markers, append only missing Ripple-owned tasks, preserve all human blocks/status, and derive verification hash from read-back markers.
- **Status:** Resolved. A provider-conformance test proves paginated discovery, missing-task-only append, marker read-back, verified binding, and no overwrite of existing human content.

### IT-019 — Concurrent execution could enter the provider layer twice

- **Severity:** Critical duplicate-effect safety.
- **Observed:** An `EXECUTING` proposal was resumable without ownership, allowing two simultaneous execute requests to enter the manifest executor.
- **Expected:** Only one active attempt owns execution; crash recovery may reclaim ownership only after a bounded lease expires.
- **Status:** Resolved. Execution now uses a durable five-minute owner lease renewed before each action and released with final state. A delayed-provider concurrency regression proves the second caller fails before a provider call.

### IT-020 — A stale confirmation response was shown as an unknown provider outcome

- **Severity:** Critical UI truthfulness.
- **Observed:** Calendar drift correctly returned an `INVALIDATED` proposal, but the client treated every successful HTTP response as approval and attempted execution, then showed unknown receipts.
- **Expected:** Only the explicit `APPROVED` state can proceed to execution; invalidation must show a stale-plan message and zero receipts.
- **Status:** Resolved. The client gates execution on canonical `APPROVED`; all other states stop before the execute request, with a focused UI regression.

## Final gate — 2026-09-13

- `npm test -- --reporter=dot`: **PASS — 92/92 tests across 12 files**.
- `npm run lint`: **PASS** (TypeScript no-emit check).
- `npm run build`: **PASS** (production build and all v1/v2 routes generated).
- `git diff --check`: **PASS**.
- Fixture UI walkthrough by the frontend lane: **PASS** for typed “yes” (no manifest), option selection, exact Notion/Calendar preview, rejection, explicit confirmation, execution, two verified receipts, and narrow-screen readability.
- Independent browser attachment was unavailable during the final tester pass; service, contract, route compilation, and focused UI-state regressions were run locally without invoking real providers.

### Deferred, non-blocking product continuity gap

- The latest conversation identifier is held in page memory. A hard refresh returns to the safe empty workspace instead of restoring a persisted completed/partial result. It does not re-enable confirmation or permit a replay, but URL/session-based conversation restoration is recommended for v3.

## PM P0 closure retest — 2026-09-13

### Automated closure evidence

- **Legacy surface isolation:** PASS. The v2 workspace contains no `/case/demo` link or `Review disruption` control; recent-change review remains inside the product workspace.
- **Screen 5 Back:** PASS. Completion maps Back to `/setup/knowledge`; the in-card control is present at desktop widths and the shell alternative is present under the 600 px breakpoint.
- **Notion executive utility:** PASS in adapter conformance. A newly created tracker contains `At a glance`, `What changed`, `Affected commitments`, `Next actions`, and `Decision log`; status, chosen decision, impact, next deadline, last updated, owners, deadlines/timezones, task state, and the explicit manual boundary are present. Stable IDs are stored as zero-width metadata links rather than normal visible copy. Pagination, read-back verification, missing-task repair, and human-content preservation still pass.
- **Calendar proof link:** PASS in adapter/service/UI conformance. The Google adapter accepts only verified HTTPS Google Calendar destinations, the public service revalidates the provider URL, and the UI renders `Open in Calendar` only for a verified receipt. A lookalike hostile hostname is explicitly rejected.
- **Accessibility-oriented DOM/CSS checks:** PASS. The exact confirmation is a labelled region; all decision controls are native keyboard buttons with explicit labels; global focus-visible and reduced-motion rules exist; the 390 px breakpoint collapses workspace, confirmation, action fields, and receipt rows without fixed-width overflow contracts.
- **Fixture safety path:** PASS three consecutive service-level rehearsals: **848 ms**, **868 ms**, and **863 ms**. Each includes the proposal/confirmation/execution safety suite with deterministic fake providers; these timings are engineering evidence, not a claim that the presenter completed the visual two-minute script.

### Final engineering gate after closures

- `npm test -- --reporter=dot`: **PASS — 100/100 tests across 13 files**.
- `npm run lint`: **PASS**.
- `npm run build`: **PASS**.
- `git diff --check`: **PASS**.

### Evidence still requiring a human/product rehearsal

- The in-app browser was unavailable to the integration lane, so actual keyboard focus order, screen-reader announcements, 125% zoom, and projector-layout behavior are not signed off by automated source/static-render checks alone.
- No real Calendar or Notion mutation was performed by the tester. The live-write rehearsal must be initiated by the user through Ripple's exact in-product confirmation, then the created Calendar hold and Notion page must be visually verified and reset using only Ripple-owned markers.

## Operational note

Starting the isolated Next.js fixture server generated root `AGENTS.md` and `CLAUDE.md` files under the framework's current agent-rules behavior. They are not test artifacts and were left for the integration owner to assess; the test lane did not edit or commit them.
