# Ripple v2 reconciled build contract

**Status:** Locked for implementation  
**Sources reconciled:** product manager, SDE, and frontend drafts

## Locked decisions

### 1. V2 product shape

V2 consists of one continuous experience:

1. five-step resumable onboarding;
2. a conversational executive scheduling workspace;
3. structured options and exact action preview;
4. a separate explicit confirmation control;
5. execution through the proven v1 approval, journal, receipt, and replay path;
6. a useful Notion follow-through tracker.

Screen 5 is both onboarding completion and the first usable assistant surface. Entering it, submitting a prompt, selecting a suggestion, or typing “yes” cannot authorize an external write.

### 2. Real integrations without OAuth theatre

V2 uses the existing server-side Gmail, Calendar, and Notion credentials for the single hackathon operator.

- Every `Connected` state must follow a fresh server-side provider identity/capability check.
- Gmail displays the masked provider-returned identity.
- Calendar displays the provider-returned selected calendar and verifies bounded read plus write capability.
- Notion displays the provider-returned workspace/destination and verifies page access.
- Client state, timers, query strings, fixture identities, or closed popups can never produce `Connected`.
- The setup actions may retain **Connect Gmail**, **Connect Calendar**, and **Connect Notion** product copy. While running against preconfigured credentials, progress copy must say **Checking your connection…**; it must not claim that a new consent flow occurred.
- Screen 1 creates a server-owned single-operator session and verifies the configured Google identity. It is not a production account-registration system.
- Demo/fixture mode must be visibly labeled and must never show fabricated identities or plain `Connected` states.

This satisfies the user's request for integrations that look complete because they are genuinely verified, while avoiding a fragile, misleading imitation of provider authorization.

### 3. V2 chat scope

Chat is constrained to a scheduling intent catalog:

- prepare/summarize the week;
- identify conflicts, tight transitions, missing preparation time, and travel buffers;
- find candidate meeting/focus windows;
- review a labeled travel disruption;
- propose a new preparation, focus, travel-recovery, or calendar hold;
- propose a Notion follow-through tracker/checklist;
- draft a stakeholder message for explicit review in the disruption flow;
- explain, reject, or refine an unexecuted proposal.

The model may interpret intent, summarize context, and propose constraints. Deterministic code owns time zones, interval calculations, event ownership, privacy, recipient allowlists, snapshot hashes, and executable manifest construction.

V2 general scheduling writes are deliberately narrow:

- create a new Ripple-owned Calendar hold/block;
- create/upsert the Notion tracker;
- send Gmail only when recipients and complete copy are shown in an exact disruption proposal.

V2 does **not** move, cancel, or edit existing meetings—even if the operator owns them. “Make Tuesday lighter” may analyze and suggest what to move manually, or offer new protection blocks, but cannot generate meeting-move actions.

### 4. Confirmation and execution

- All actionable chat output becomes a server-persisted, versioned proposal.
- Selecting an option generates the exact manifest server-side.
- The confirmation card displays every Calendar, Notion, and Gmail effect.
- The client submits only proposal/version/hash references; it never submits action bodies at confirmation time.
- Confirmation revalidates actor, version, expiry, manifest hash, and current Calendar/source snapshots.
- A material edit creates a new proposal version and invalidates the prior approval target.
- Reject is a real terminal state with zero receipts and zero provider effects.
- Execution reuses a provider-agnostic wrapper around the v1 approval/executor; chat does not receive writer ports.
- Action order remains Notion → Calendar → Gmail, skipping stages absent from the manifest.
- No success is rendered until a provider-backed verified receipt exists.

### 5. Notion follow-through tracker

V2 uses a page, not a Notion database:

- one child page per recovery case or scheduling proposal;
- executive summary and affected commitments;
- decisions;
- `Next actions` as Notion `to_do` blocks;
- visible owner, deadline/timezone, and status per task;
- useful source/Calendar links where safe.

The adapter gains a structured `NOTION_TRACKER_UPSERT` action. It uses stable subject/task markers, persists page/block bindings, verifies writes, and updates only Ripple-owned content. It never replaces or deletes unrelated human-authored blocks.

V2 tracker behavior is one-way:

- Ripple creates the initial tracker and can idempotently reconcile its own blocks after a crash/replay.
- The executive/team may check tasks directly in Notion.
- Ripple does not read checkbox/status edits back from Notion in v2.
- Subsequent chat turns do not overwrite manually changed task status. P0 may append a new decision/task delta when ownership is certain; otherwise it stops with a conflict.

Technical hashes, request payloads, and receipt logs remain inside Ripple and are not the Notion experience.

## Explicit deferrals

The following are v3 or post-hackathon work:

- self-service Google OAuth, progressive Gmail/Calendar consent, account switching, token lifecycle UI, and multi-user identity;
- public Notion OAuth and arbitrary workspace installation;
- Notion databases, relations, rollups, people properties, webhooks, and two-way task/status synchronization;
- arbitrary tool use from free-form chat or natural-language-only approval;
- moving, cancelling, or editing existing meetings;
- automatic invitation of attendees or inferred email recipients;
- durable cloud Gmail push monitoring and distributed workers;
- travel purchase/rebooking, Slack/CRM/meeting-room integrations, and organization administration;
- editing tracker status inside Ripple;
- long-term cross-device conversation persistence if it threatens the golden path.

The local watcher and narrow Gmail label/filter may be used for the demo, but the UI may say **Monitoring is on** only when a current server heartbeat proves it.

## Dependency order

```text
0. Freeze public contracts and v1 regression fixtures
   ├─ 1A. Frontend shell, routes, design tokens, fixture-backed states
   └─ 1B. Server session, onboarding store, provider verifiers
             ↓
2. Bind onboarding UI to verified server summaries
             ↓
3A. Read-only conversation + deterministic scheduling analysis
3B. Notion tracker schema, markers, and adapter conformance
             ↓
4. Proposal state machine + exact manifest preview + reject
             ↓
5. Shared approval/execution spine + chat confirmation
             ↓
6. Real-provider golden path, reset, accessibility, and demo hardening
```

Detailed implementation sequence:

1. Version and check in DTOs, JSON schemas, fake fixtures, error categories, and state transitions before UI/API work diverges.
2. Extract/wrap the v1 executor without changing v1 hashes or behavior; keep the current suite green.
3. Build the server-owned demo session, onboarding persistence, and read-only connection-verifier ports.
4. In parallel, build the five routes and Screen 5 workspace against shared fixtures only.
5. Connect onboarding to real verifier endpoints; prove refresh/resume and scoped `Needs attention` states.
6. Build read-only `Prepare my week`, `Find time`, and `Review recent changes`; writer call count must remain zero.
7. Implement Notion tracker action/bindings and adapter tests independently of chat.
8. Add proposal alternatives, exact preview, versioning, rejection, expiry, and stale-snapshot regeneration.
9. Route confirmed proposals through the shared executor; first support Calendar + Notion, then enable Gmail-last for exact disruption messages.
10. Seed/reset executive-week edge cases, complete end-to-end and accessibility testing, and freeze the two-minute demo fixture.

## Agent and module ownership

| Owner | Modules / decisions | Must not own |
|---|---|---|
| **SDE** | v2 domain schemas; session/onboarding persistence; connection registry and verifier ports; provider adapters; scheduling constraint engine; conversations/proposals; manifest builder; shared approval/execution spine; artifact bindings; API routes; unit/contract/integration tests; seed/reset safety | Visual success inference, raw provider UI state, or product-copy changes without PM review |
| **Frontend developer** | route/layout decomposition; onboarding components; Screen 5 workspace; conversation, option, confirmation, progress, and recovery components; responsive/accessibility behavior; loading/error copy implementation; frontend contract fixtures and UI/E2E tests | Provider SDKs, token handling, canonical connection state, manifest construction, or optimistic provider success |
| **Product manager** | supported intent catalog; permission/value copy; action-preview content requirements; Notion tracker usefulness; demo scenario; acceptance review; cut decisions and scope-change arbitration | Changing API contracts or adding actions after contract freeze without SDE impact review |
| **Root/integration owner** | contract merge order; environment/preflight; real-provider golden path; regression/benchmark execution; final reset verification and release decision | Bypassing a failed gate to preserve demo optics |

### Module boundary rules

- Provider SDK imports exist only in server adapters.
- Onboarding and conversation-read routes cannot import writer ports.
- Frontend consumes normalized view models and opaque IDs only.
- Confirmation endpoints cannot accept free-form chat text or client-authored action payloads.
- Shared contract fixtures are the integration boundary between SDE and frontend.
- PM copy/state requirements are encoded as fixtures/acceptance tests before visual polish is declared complete.

## Release gates

V2 may be called demo-ready only when all gates pass.

### Product and UI

- All five screens have default, loading, success, error, Back, refresh, and narrow-mobile behavior.
- Screen 5 supports a real prompt, grounded answer, options, exact confirmation, rejection, execution progress, and provider result.
- There are no dead buttons, empty link shells, technical setup copy, or fabricated success states.
- Keyboard, screen-reader status announcements, reduced motion, and 390 px layout pass.

### Integration truth

- Each real connection badge is backed by a provider verification inside the configured validity window.
- Provider revocation changes only the relevant connection to `Needs attention`.
- `Prepare my week` reads the current seeded Calendar, not hard-coded event copy.
- Real provider links are rendered only from validated server results.

### Safety and execution

- Ordinary chat, option selection, typed “yes,” and rejection each produce zero external writes.
- Exact confirmation is bound to actor, proposal/version, immutable manifest, expiry, and current snapshots.
- Stale, expired, tampered, double-confirmed, or cross-user requests do not create extra effects.
- Every intent is journaled before the first provider call.
- Notion failure suppresses Calendar and Gmail; Calendar failure suppresses Gmail.
- Unknown Gmail outcome is never blindly retried.
- Every claimed completion has a verified receipt; replay produces zero new effects.

### Notion utility

- The real golden path creates one non-empty tracker with executive summary, affected commitments, decisions, and at least two tasks with owners, deadlines, and visible statuses.
- Replay/crash reconciliation creates no duplicate page or task.
- Manual non-Ripple blocks and manually changed checkboxes survive Ripple reconciliation.
- The returned link opens the real page under the verified destination.

### Regression and operations

- Existing v1 tests, safety benchmark, lint/typecheck, and production build remain green.
- New contract, adapter, API, concurrency, UI, and end-to-end suites pass.
- Seed/reset touches only explicitly marked Ripple fixtures and restores the original calendar baseline.
- No credentials, personal messages, private event contents, chat text, or provider payloads enter the repository, client bundle, logs, analytics, or model prompt unnecessarily.
- Three rehearsals complete in under two minutes with the same resettable fixture.

## Unresolved blockers

There is no product-scope blocker.

Before implementation reaches real-provider binding, the integration owner must confirm through preflight—without exposing secrets—that the current Google grant supports Gmail read/send and Calendar read/write, and that the Notion integration can retrieve and create beneath the configured parent. A failed capability is an environment blocker, not permission to fabricate a connected state; the affected screen must remain `Needs attention` while fixture mode stays explicitly labeled.
