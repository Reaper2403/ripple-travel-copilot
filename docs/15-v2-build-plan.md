# Ripple v2 — canonical build plan

**Status:** Ready for implementation approval  
**Planning team:** Product manager, software architect, frontend developer  
**Constraint:** This document plans v2; it does not authorize or contain production implementation changes.

## 1. Product outcome

V2 turns Ripple into a credible executive scheduling assistant with one continuous experience:

1. The executive completes a polished, resumable five-step setup.
2. Ripple genuinely verifies Gmail, Google Calendar, and Notion using the hackathon operator's existing server-side credentials.
3. The executive asks Ripple questions about their week and explores grounded scheduling options in conversation.
4. Ripple shows an exact action preview whenever an external change would help.
5. Only a separate confirmation control can execute the immutable plan.
6. Confirmed plans create useful Calendar protection and a living Notion follow-through workspace.

The attached Screen 5 is therefore not a decorative completion screen. It is the first view of the assistant workspace and the main product surface after onboarding.

## 2. Locked v2 scope

### Must ship

- Five routed onboarding screens with progress, Back, retry, refresh/resume, and truthful loading/error/success states.
- Server-derived, masked Gmail identity and verified read/send capabilities.
- Provider-derived Calendar selection with bounded read and confirmed write access.
- Provider-derived Notion workspace/destination with verified page access.
- A useful Screen 5 composer with `Prepare my week`, `Review recent changes`, and `Show how approval works` starters.
- Read-only schedule analysis for conflicts, tight transitions, missing preparation time, travel buffers, and candidate focus/meeting windows.
- One to three structured options with assumptions, trade-offs, and affected commitments.
- A persisted, versioned proposal and exact action confirmation card.
- Safe creation of new Ripple-owned Calendar holds/blocks.
- A real Notion follow-through tracker with actions, owners, deadlines, and status.
- Gmail sending only for disruption workflows where recipients, subject, and full message are previewed.
- Real rejection, stale-plan handling, provider receipts, replay protection, and resettable demo data.

### Explicitly deferred to v3

- Self-service multi-user Google OAuth, account switching, and token lifecycle UI.
- Public Notion OAuth and arbitrary workspace installation.
- Moving, cancelling, or editing existing meetings.
- Natural-language-only approval such as “yes” or “do it.”
- Arbitrary tool use, inferred recipients, automatic invitations, travel purchasing, or rebooking.
- Notion databases, two-way status sync, webhooks, and arbitrary customer schemas.
- Durable cloud Gmail push workers and enterprise administration.

The narrow write scope is intentional: v2 can analyze an existing meeting and recommend a manual change, but its general scheduling action is creating a new Ripple-owned block. This keeps the assistant useful while preserving a demoable safety boundary.

## 3. Integration strategy

V2 uses the credentials already configured for the hackathon operator. Each onboarding action calls a real server verifier and may show `Connected` only after that verifier succeeds.

| Integration | V2 verification | Product result |
|---|---|---|
| Gmail | Profile plus bounded label/read and send-capability checks | Masked provider-returned identity |
| Calendar | List calendars, select one, bounded event read, verify writable role | Real selected calendar name |
| Notion | Retrieve bot/workspace and configured parent page; verify child-page capability safely | Real workspace and destination breadcrumb |

While using preconfigured credentials, progress copy says **Checking your connection…**. It must not pretend a new provider consent occurred. Full self-service OAuth is a v3 concern and is unnecessary for the v2 hackathon path.

## 4. Screen 5: conversational executive utility

The assistant supports a constrained intent catalog:

- prepare or summarize the week;
- identify conflicts, tight transitions, missing preparation time, and travel buffers;
- find candidate windows under explicit duration, timezone, working-hours, and buffer constraints;
- review a labeled travel disruption;
- propose a preparation, focus, recovery, or travel hold;
- propose a new time for a conflicting meeting the executive does not own by creating a separate, confirmation-gated Calendar invitation to its organizer;
- create a Notion follow-through checklist;
- draft an explicit stakeholder message in a disruption flow;
- explain, reject, or refine an unexecuted proposal.

The interaction sequence is fixed:

```text
Question
  -> bounded read of connected context
  -> executive summary
  -> 1–3 options with trade-offs
  -> option selection or refinement
  -> immutable server-built action manifest
  -> exact confirmation card
  -> explicit confirmation
  -> provider execution and verified receipts
  -> Notion follow-through workspace
```

Chat can explore freely but cannot authorize side effects. Selecting an option or typing “yes” only opens the confirmation card.

Ripple reads both the primary and selected executive calendars for conflict analysis but writes only to the selected calendar. A proposed-time invitation leaves the organizer's original event untouched. If that original event is cancelled or its organizer changes before execution, the reviewed proposal becomes invalid and no invitation is sent.

## 5. Notion utility: executive follow-through workspace

Create one child page for each recovery case or confirmed scheduling subject. It is a shared operating page, not a technical ledger.

Required content:

1. **At a glance** — status, decision, impact, next deadline, last updated.
2. **What changed** — concise source-grounded summary.
3. **Affected commitments** — time, owner/host, impact, chosen response.
4. **Next actions** — editable Notion to-do blocks with owner, deadline/timezone, and visible status.
5. **Decision log** — human-readable decisions and timestamps.
6. **Links** — safe links to relevant Calendar items and the Ripple case.

Ripple owns only the blocks it creates. Stable subject/task markers and stored page/block bindings make replay idempotent. Human-authored blocks and manually changed checkboxes are preserved. V2 does not sync those edits back into Ripple.

## 6. Module contracts

The complete field-level contracts live in the SDE plan. These boundaries are frozen before UI and server work proceed in parallel.

| Module | Input | Output | Invariant |
|---|---|---|---|
| Session/onboarding | Server-owned operator session | Versioned `OnboardingProfile` | Client cannot declare a step connected |
| Connection verifier | Provider and required capabilities | Normalized `ConnectionSummary` | Raw tokens and provider payloads never reach UI |
| Context assembly | User, intent, bounded date range | Privacy-filtered source snapshot + hash | Read-only; no writer port is available |
| Scheduling engine | Structured intent and source snapshot | Deterministic candidate options | Code owns timezones, overlaps, ownership, and policy |
| Conversation/proposal | User message and candidates | Versioned `SchedulingProposal` | Model output cannot be executed directly |
| Manifest builder | Selected proposal version | Immutable `ActionManifest` + hash | Client cannot submit or modify action bodies |
| Approval service | Actor, proposal/version/hash | Approved or rejected proposal | Revalidates actor, expiry, version, and snapshots |
| Shared executor | Approved manifest | Journal entries and verified receipts | Ordered Notion → Calendar → Gmail; idempotent replay |
| Notion tracker adapter | Structured tracker upsert | Page/block bindings and verified link | Updates Ripple-owned blocks only |
| Product UI | Normalized view models | Accessible screens and confirmation controls | No optimistic provider success |

Provider SDK imports remain inside server adapters. Onboarding and conversational read routes cannot import writer ports. Confirmation endpoints accept only opaque proposal/version/hash references—not chat text or client-authored actions.

## 7. Incremental build plan

| Increment | SDE deliverable | Frontend deliverable | PM / acceptance gate |
|---|---|---|---|
| **0 — Freeze contracts** | Version DTOs, schemas, state machines, fixtures, normalized errors; wrap v1 executor without behavior change | Establish route shell, tokens, reusable controls, fixture harness | Approve intent catalog, copy, and exact-preview requirements; all v1 tests remain green |
| **1 — Verified onboarding** | Demo session, onboarding store, Gmail/Calendar/Notion verifier ports and endpoints | Build five responsive routes with all default/loading/success/error/resume states | No technical jargon or fake connection state; refresh resumes correctly |
| **2 — Read-only assistant** | Conversations, bounded context reads, deterministic schedule analysis, structured model output | Screen 5 workspace, composer, messages, suggestion and option cards | `Prepare my week`, `Find time`, and `Review recent changes` provide grounded value with zero writes |
| **3 — Notion tracker** | Tracker schema, stable markers, bindings, idempotent upsert and verification | Tracker preview and result link/checklist presentation | Real page has summary, commitments, decisions, and at least two owned/due/status tasks |
| **4 — Proposal and approval** | Proposal lifecycle, versions, expiry, hashes, snapshot validation, manifest builder, reject | Exact confirmation, revision/reject, stale/expired states | Every effect is visible; typing “yes,” selecting, and rejecting produce zero writes |
| **5 — Safe execution** | Route approved chat proposals through v1 journal/executor; Calendar + Notion first, Gmail-last disruption flow | Execution progress, partial/unknown failure, verified result receipts | Ordering, replay, double-confirm, tamper, and failure suppression tests pass |
| **6 — Demo hardening** | Real-provider preflight, executive-week seed/reset, privacy review, production checks | Mobile, keyboard, screen reader, reduced-motion polish; remove every dead control | Three resettable two-minute rehearsals pass; no credentials or personal data are committed |

Increments 1 server work and frontend fixture work can run in parallel after Increment 0. The Notion adapter can also proceed alongside read-only conversation work after its contract is frozen.

## 8. API surface

### Onboarding

```text
GET  /api/v2/onboarding
POST /api/v2/onboarding/account
POST /api/v2/connections/gmail/verify
GET  /api/v2/connections/calendar/options
POST /api/v2/connections/calendar/select
POST /api/v2/connections/notion/verify
POST /api/v2/onboarding/complete
```

### Conversation and execution

```text
POST /api/v2/conversations
GET  /api/v2/conversations/:id
POST /api/v2/conversations/:id/messages
POST /api/v2/proposals/:id/select
POST /api/v2/proposals/:id/confirm
POST /api/v2/proposals/:id/execute
POST /api/v2/proposals/:id/reject
GET  /api/v2/proposals/:id/receipts
POST /api/v2/proposals/:id/replay-check
```

## 9. Testing and release gates

V2 is demo-ready only when all of the following are true:

- Every onboarding screen covers loading, cancellation, wrong account, missing permission, provider outage, Back, refresh, and retry.
- Each `Connected` badge is backed by a recent real provider verification.
- Ordinary chat, option selection, typed approval, and rejection make zero external writes.
- Expired, stale, tampered, double-confirmed, replayed, or cross-session proposals create no unintended effect.
- Notion failure prevents Calendar and Gmail; Calendar failure prevents Gmail; uncertain Gmail sends are not blindly retried.
- The Notion tracker is non-empty, opens at the verified destination, survives replay without duplication, and preserves human content.
- The seeded executive week covers overlaps, timezone changes, tight transitions, missing buffers, immutable third-party meetings, and open focus windows.
- Reset touches only explicitly marked Ripple fixtures and restores the exact pre-test Calendar baseline.
- Existing v1 tests and safety benchmark, plus v2 unit, contract, integration, UI, accessibility, and end-to-end suites, are green.
- There are no dead buttons, empty link shells, fabricated receipts, leaked secrets, personal messages, or private provider payloads.

## 10. Two-minute demo spine

1. **0:00–0:20 — Trust:** rapidly show three genuinely verified integrations and land on Screen 5.
2. **0:20–0:45 — Insight:** ask `Prepare my week`; Ripple finds one meaningful pressure point in the seeded Calendar.
3. **0:45–1:10 — Choice:** compare two options and select a protection/recovery plan.
4. **1:10–1:30 — Control:** show the exact Calendar and Notion effects; stress that chat alone cannot execute; confirm once.
5. **1:30–1:50 — Proof:** show the real Calendar block and useful Notion tracker with owners/deadlines/status.
6. **1:50–2:00 — Thesis:** Ripple turns schedule disruption into an approved, accountable plan across three real tools.

## 11. Ownership and start condition

- **SDE:** schemas, services, adapters, APIs, deterministic scheduling, approval/execution, integration tests.
- **Frontend developer:** routes, visual system, onboarding, Screen 5, proposals, confirmation, progress, responsive/accessibility tests.
- **Product manager:** scope control, copy, intent behavior, Notion usefulness, demo story, acceptance decisions.
- **Integration owner:** merge order, credential-safe preflight, real-provider golden path, seed/reset, regression and release decision.

There is no unresolved product-scope blocker. Before binding real provider UI, run a credential-safe preflight confirming Gmail read/send, Calendar read/write, and Notion retrieve/create access. A failed check becomes `Needs attention`; it is never replaced by a fake success state.

## Supporting role documents

- `planning/v2/product-manager.md`
- `planning/v2/sde.md`
- `planning/v2/frontend.md`
- `planning/v2/reconciliation.md`
- `docs/14-onboarding-v2-spec.md`
- `design/v2-onboarding/`
