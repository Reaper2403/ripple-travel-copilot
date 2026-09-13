# Ripple v2 frontend implementation plan

Status: implementation-ready proposal; no production code changed  
Owner: frontend  
Depends on: product approval, onboarding/session APIs, provider callback contracts

## Product outcome

V2 should feel like setting up and working with a trusted executive assistant, not configuring an integration demo. It has two connected experiences:

1. A resumable five-step setup that explains value before access and proves each connection server-side.
2. A conversational executive workspace where Ripple can explore schedule questions freely, but cannot change an external system until it shows an exact confirmation card and the user approves it.

Notion becomes the durable follow-through surface. Every approved recovery can create or update a **Recovery workspace** page containing a concise situation brief plus an owner/deadline/status checklist. This is useful after the disruption instead of being a write-only audit ledger.

## Experience map and route boundaries

```text
/welcome
  -> /setup/email
  -> /setup/calendar
  -> /setup/knowledge
  -> /setup/complete
  -> /workspace
       |- conversational exploration (read-only)
       |- option comparison (read-only)
       |- exact action confirmation (approval boundary)
       `- execution progress and receipts

/settings/connections
  `- reconnect/change Gmail, Calendar, or Notion destination

/auth/:provider/start
  -> provider consent
  -> /auth/:provider/callback
  -> verified server state
  -> return_to a validated setup/settings route
```

Use route groups for layout separation, but expose the stable URLs above. `/` reads the canonical onboarding profile and redirects to the first incomplete step or `/workspace`. A completed step may be revisited without disconnecting it. A user cannot deep-link past an incomplete required step; the server redirects them to the first incomplete step.

Suggested Next.js structure:

```text
app/
├── (auth)/welcome/page.tsx
├── (onboarding)/setup/layout.tsx
│   ├── email/page.tsx
│   ├── calendar/page.tsx
│   ├── knowledge/page.tsx
│   └── complete/page.tsx
├── auth/[provider]/callback/route.ts
├── (product)/workspace/page.tsx
└── (product)/settings/connections/page.tsx

components/
├── onboarding/
│   ├── OnboardingShell.tsx
│   ├── OnboardingProgress.tsx
│   ├── AccountWelcome.tsx
│   ├── ProviderConnectCard.tsx
│   ├── ConnectionIdentity.tsx
│   ├── PermissionSummary.tsx
│   ├── CalendarPicker.tsx
│   ├── NotionDestinationPicker.tsx
│   └── SetupHandoff.tsx
├── assistant/
│   ├── AssistantWorkspace.tsx
│   ├── AssistantComposer.tsx
│   ├── PromptSuggestions.tsx
│   ├── ConversationThread.tsx
│   ├── ScheduleOptionCard.tsx
│   ├── ActionConfirmationCard.tsx
│   ├── ExecutionProgress.tsx
│   └── ConnectionHealthStrip.tsx
├── recovery/
│   ├── RecoveryBriefPreview.tsx
│   ├── FollowThroughChecklist.tsx
│   └── ActionReceiptList.tsx
└── ui/
    ├── Button.tsx
    ├── InlineAlert.tsx
    ├── ProviderMark.tsx
    ├── ProgressBar.tsx
    ├── Skeleton.tsx
    └── StatusPill.tsx
```

The existing v1 case view remains reachable as the detailed review surface during migration. New components consume normalized view models; they must not parse raw Gmail, Calendar, Notion, or OpenAI responses.

## State ownership

### Server-owned canonical state

- signed-in user and secure session;
- current/completed onboarding steps;
- provider connection state, connected identity, granted capability set, and last verification time;
- selected Calendar and Notion destination;
- conversations, cases, option sets, action manifests, approvals, execution receipts, and connection health;
- whether a session is `demo` or `live`.

### URL-owned state

- current wizard step;
- workspace conversation/case selection;
- a short-lived callback result code (`connected`, `cancelled`, `attention`) used only to choose feedback copy;
- an opaque, signed return-state identifier.

### Client-owned ephemeral state

- input text and unsent draft;
- open/closed disclosure panels;
- selected option before confirmation;
- focus restoration target;
- optimistic presentation only for non-destructive UI changes.

Never set `connected` from local storage, a closed popup, or a query parameter. After a callback, refetch the server profile and render success only when the provider is `verified`.

```ts
type Provider = "gmail" | "calendar" | "notion";
type ConnectionStatus =
  | "not_started"
  | "redirecting"
  | "verifying"
  | "verified"
  | "needs_attention";

interface ConnectionViewModel {
  provider: Provider;
  status: ConnectionStatus;
  identityLabel?: string;       // masked email, calendar name, or workspace
  destinationLabel?: string;    // chosen calendar/page breadcrumb
  capabilities: string[];       // product-language summaries, not scopes
  lastVerifiedAt?: string;
  recoveryAction?: "retry" | "reconnect" | "choose_destination";
  safeMessage?: string;
}
```

For a demo connector, the server sets `mode: "demo"` and the UI uses **Demo connection ready** plus `Uses a safe demo workspace; no external account was connected.` It must never use the plain `Connected` label or display a fabricated identity. This preserves a polished walkthrough without a deceptive success claim.

## Five-step onboarding states

All routes render inside `OnboardingShell` with Ripple wordmark, `Step X of 5`, forward/back controls, and Save and exit after account creation. Progress updates only after canonical server state changes.

### 1. Account creation — `/welcome`

Inputs: Google identity only.  
Primary: **Continue with Google**.  
Loading: button becomes **Creating your workspace…**, remains in place, and is disabled.  
Success trigger: server creates user, session, and onboarding profile; route to `/setup/email`.  
Errors: cancelled sign-in, duplicate/conflicting identity, session failure. Explain that no apps were connected and offer **Try again**.  
Return: an existing user resumes the first incomplete step; a completed user enters `/workspace`.

### 2. Gmail — `/setup/email`

Default explains: find likely travel changes, show source evidence, and send only approved messages.  
Primary: **Connect Gmail**.  
Redirecting: **Opening Gmail…**; disable duplicate launches.  
Return: render **Confirming your Gmail connection…** while the server exchanges the code and verifies the required abilities.  
Verified: show masked identity, verification mark, and **Continue to Calendar**.  
Errors: consent cancelled, wrong account, missing permission, expired state, provider unavailable. Preserve earlier setup and offer a single next action.  
Transition trigger: a bounded Gmail profile check and capability verification succeed.

### 3. Calendar — `/setup/calendar`

Default explains conflict detection, prep time, and recovery blocks; state that meetings are not moved automatically.  
Primary: **Connect Google Calendar**.  
Loading: first provider handoff, then a three-row skeleton while calendars are discovered.  
Selection: radio cards show calendar name, ownership, and Primary badge. Preselect the primary calendar but require **Use this calendar**.  
Verified: show the chosen calendar and **Continue to Notion**.  
Errors: no writable calendar, missing access, lost provider response, temporary outage. Gmail stays visibly connected.  
Transition trigger: the server can read a bounded event window and verifies the selected writable calendar.

### 4. Notion — `/setup/knowledge`

Default explains the **Recovery workspace**: a living brief plus owner/deadline/status checklist.  
Primary: **Connect Notion**.  
Return: **Confirming your workspace…** while available shared pages are loaded.  
Selection: workspace identity and accessible parent pages; show breadcrumb and **Choose another page**.  
Verified: `Recovery workspaces will be created inside [workspace / page]`; primary becomes **Finish setup**.  
Errors: no page shared, read-only page, destination removed, wrong workspace. Give contextual instructions without exposing integration IDs.  
Transition trigger: server verifies parent access and create-child capability without leaving a test page behind (or creates and immediately archives a clearly named verification page).

### 5. First-run handoff — `/setup/complete`

Show the attached Screen 5 direction: concise greeting, connected summary, assistant composer, three useful suggestions, and quiet monitoring status. The screen is no longer a decorative empty state; it is the first usable workspace surface.

- **Prepare my week** asks Ripple to identify tight transitions, missing prep time, focus fragmentation, travel buffers, and overlapping commitments.
- **Review recent changes** checks relevant notices against upcoming commitments.
- **Plan my week** accepts a conversational objective such as “Protect three focus blocks and move internal meetings where I’m the organizer.”
- **Show how approval works** starts a clearly labeled sample and stops before writes.

Submitting a real prompt transitions to `/workspace?conversation=<id>` with the sent message visible. **Open my workspace** is retained as a secondary route for users who do not want to prompt yet.

Partial setup should identify the exact connection needing attention. Required hackathon integrations keep **Finish setup** disabled, while a product build may later allow **Use Ripple with limited access** with explicit limitations.

## Conversational executive workspace

The workspace should answer questions and produce scheduling options before it proposes actions. The chat is not a free-form command shell.

```text
User request
 -> interpret objective and bounded date range
 -> read connected context
 -> ask only material clarifying questions
 -> show 1–3 schedule options with trade-offs
 -> user selects/refines an option
 -> server creates immutable action manifest
 -> exact confirmation card
 -> explicit user approval
 -> execute once, stream/poll receipt states
 -> summary + Notion follow-through workspace
```

Examples within v2 scope:

- “Prepare my week” — analyze only, then suggest focus blocks, prep blocks, and safe buffers.
- “Make Tuesday lighter” — propose movable owned meetings and blocks; never imply third-party meetings can be moved.
- “Handle this flight cancellation” — show affected meetings, message drafts, Calendar updates, and Notion checklist.

### Exact confirmation card

`ActionConfirmationCard` is mandatory whenever a proposal contains external writes. It receives an immutable server manifest and displays:

- plain-language purpose and expiry;
- every action grouped by provider;
- Calendar title, date/time/timezone, target calendar, create/update intent, and any attendees affected;
- Gmail recipients, CC/BCC, subject, and full message body;
- Notion workspace/page, recovery title, brief sections, and checklist items with owner, due date, and initial status;
- statements of what Ripple will not change;
- **Confirm and make N updates** and **Keep editing** actions.

```ts
interface ActionConfirmationCardProps {
  caseId: string;
  caseVersion: number;
  planId: string;
  planHash: string;
  expiresAt: string;
  actions: ActionPreviewVM[];
  onEdit(): void;
  onConfirm(input: {
    caseId: string;
    caseVersion: number;
    planId: string;
    planHash: string;
  }): Promise<void>;
}
```

The confirm button is disabled when the manifest is stale, expired, still loading, or contains an unresolved ambiguity. Editing creates a new plan/version and invalidates the old approval. The UI cannot construct or modify the manifest at confirm time. Confirmation is idempotent; double-clicks and refreshes attach to the same execution.

### Conversation presentation states

- **Thinking:** compact inline state, `Checking your schedule…`; composer remains visible but prevents duplicate submission.
- **Needs input:** one focused question with explicit choices where possible.
- **Options ready:** comparison cards with trade-offs, affected items, and `Preview this plan`.
- **Confirmation required:** exact action card pinned to the latest assistant turn; no ambiguous “Yes” approval.
- **Executing:** per-action statuses `Waiting`, `Making update`, `Confirmed`, `Not completed`, `Needs your attention`.
- **Complete:** concise outcome, links to real provider objects only when valid destinations exist, plus `No duplicate updates created` after replay verification.
- **Partial/unknown:** distinguish known failure from uncertain provider outcome; never invite blind retry for an unknown result.
- **Read-only answer:** no confirmation card and an explicit `No changes were made` footer.

## Notion recovery workspace contract

The Notion action should upsert one page per recovery case, not create a new page on every chat turn. The frontend preview and final receipt use the same structure:

```ts
interface RecoveryWorkspacePreview {
  title: string;
  destination: { workspace: string; parentPage: string };
  situation: string;
  affectedCommitments: Array<{ title: string; time: string; impact: string }>;
  decisions: string[];
  checklist: Array<{
    id: string;
    task: string;
    owner: string;
    dueAt?: string;
    status: "Not started" | "In progress" | "Done" | "Blocked";
  }>;
  sourceLinks: Array<{ label: string; href: string }>;
}
```

Keep v2 manipulation modest: create/update checklist rows as page blocks, show them in the approval preview, and surface the resulting Notion page after execution. Editing checklist status inside Ripple is out of scope unless a server contract is added; the page remains directly useful in Notion.

## Core component contracts

| Component | Receives | Emits / responsibility |
|---|---|---|
| `OnboardingShell` | step, title, children, save eligibility | layout, progress, back/save navigation only |
| `ProviderConnectCard` | normalized connection VM, value copy | `connect`, `retry`, `changeAccount`; never declares verification |
| `ConnectionIdentity` | status, masked identity, destination | accessible connection summary |
| `CalendarPicker` | calendar choices, selected ID, busy state | selected ID; server validates on submit |
| `NotionDestinationPicker` | verified accessible pages, selected ID | destination selection; never accepts arbitrary URLs |
| `AssistantComposer` | draft, disabled state, suggestions | sanitized user message; no execution intent |
| `ScheduleOptionCard` | option VM and trade-offs | `select`, `refine`, `preview`; no write |
| `ActionConfirmationCard` | immutable manifest preview and expiry | approval tuple only |
| `ExecutionProgress` | receipt view models | display/reconciliation controls; no optimistic success |
| `FollowThroughChecklist` | preview or provider-backed items | read-only in v2 |

All mutation components require server-generated opaque IDs. Provider URLs are rendered only after allow-list validation and with `target="_blank" rel="noopener noreferrer"`.

## Responsive behavior

- Desktop onboarding: optional value narrative at left, 480–560 px setup card at right; keep the primary action in a stable position.
- Tablet: single centered column, narrative collapses to a short heading, connection identity stays above actions.
- Mobile: 20 px gutters, compact progress bar with current step label, sticky bottom action area respecting safe-area insets, minimum 44 px touch targets.
- Workspace desktop: conversation column max 760 px; optional right context rail for connection health/current week. Confirmation card remains in the conversation, not in a detached side panel.
- Workspace mobile: cards stack; action groups are collapsed with readable summaries but auto-open on validation errors. Composer grows to four lines and remains above the keyboard.
- Long identities, workspace names, subjects, and event titles wrap or truncate with an accessible full label; no horizontal scrolling.
- Dates always show timezone; ambiguous cross-zone requests trigger clarification rather than silent conversion.

## Design tokens

Build on the approved mockup rather than v1’s dense operations dashboard.

```css
--color-ink: #1d2028;
--color-muted: #697080;
--color-subtle: #f6f7fa;
--color-line: #e3e6ed;
--color-brand: #5263d9;
--color-brand-hover: #4353c1;
--color-brand-soft: #eef0ff;
--color-success: #237a55;
--color-success-soft: #edf8f2;
--color-warning: #95670b;
--color-warning-soft: #fff7df;
--color-danger: #a23e3b;
--color-danger-soft: #fff0ee;
--radius-control: 10px;
--radius-card: 16px;
--shadow-card: 0 12px 36px rgba(28, 35, 61, .08);
--content-setup: 560px;
--content-chat: 760px;
--motion-fast: 160ms;
--motion-normal: 220ms;
```

Use system sans or the existing product font, restrained shadow, generous white space, one indigo accent, and real provider brand marks only where identification matters. Do not use green as the primary brand color; reserve it for verified success. Support dark text contrast of at least 4.5:1 and non-color status cues.

## Accessibility

- One `h1` per route and ordered headings within cards.
- Use a semantic ordered list for progress; current step uses `aria-current="step"`.
- Provider status changes use a polite live region; errors use `role="alert"` and focus the error heading after callback failure.
- Focus returns to the initiating connection card after provider return.
- Calendar/page selections use `fieldset`, `legend`, and native radio inputs.
- Composer has a persistent label (visually hidden is acceptable); Enter sends and Shift+Enter inserts a newline.
- Confirmation is never triggered by Enter while focus is in the composer. Approval requires activating the explicit button.
- Execution progress exposes textual status and does not rely on animation/color.
- Skeletons use `aria-hidden`; containers announce the real loading label.
- Respect `prefers-reduced-motion`; avoid auto-advancing before a success announcement can be perceived.
- Trap focus only in true modal dialogs. The onboarding itself is a route, not a modal.

## Analytics events

No email contents, event titles, attendee addresses, chat text, tokens, provider IDs, or Notion page content may be logged.

| Event | Safe properties |
|---|---|
| `onboarding_step_viewed` | step, mode |
| `provider_connect_started` | provider, step, mode |
| `provider_connect_returned` | provider, result category, duration bucket |
| `provider_verified` | provider, mode |
| `provider_connection_failed` | provider, safe error category, retryable |
| `onboarding_completed` | duration bucket, mode |
| `assistant_prompt_submitted` | entry point, intent category, mode |
| `schedule_options_presented` | option count, intent category |
| `schedule_option_selected` | option rank, action count |
| `confirmation_viewed` | provider set, action count |
| `confirmation_approved` | provider set, action count |
| `confirmation_edited` | reason category |
| `execution_finished` | success/partial/unknown, provider set |
| `notion_workspace_created` | checklist item count, mode |

## UI test cases

### Onboarding

1. New user completes all five steps; each success follows a fresh server verification.
2. Refresh on every step preserves progress and connected identities.
3. Browser Back does not disconnect providers or falsely regress progress.
4. Deep-link past an incomplete required step redirects correctly.
5. Cancel, expired state, state mismatch, popup blocked, and provider outage remain on the same step with one recovery action.
6. A query string saying `connected` cannot produce a success state by itself.
7. Wrong Gmail account can be replaced without losing the Ripple account.
8. Missing Calendar write ability does not appear verified.
9. Multiple calendars require a confirmed selection; removed calendar returns to selection.
10. Unshared/read-only Notion pages show precise recovery guidance.
11. Demo connector displays `Demo connection ready`, never `Connected`, and never fabricates identity.
12. Keyboard-only and screen-reader paths complete setup; live announcements are not duplicated.
13. Mobile layouts at 320, 375, 768, and 1024 px have no clipped copy or hidden primary action.

### Assistant and approval

1. Read-only schedule questions never show an approval button and end with `No changes were made`.
2. Ambiguous dates/timezones/attendees produce clarification instead of a manifest.
3. Option refinement invalidates the prior manifest and confirmation.
4. Exact Calendar, Gmail, and Notion payload previews match the server manifest.
5. Double-click, refresh during execution, network retry, and replay create no duplicate provider writes.
6. Stale or expired confirmations are disabled and regenerate from current context.
7. Unknown provider outcomes show manual reconciliation and do not expose blind retry.
8. Partial completion shows which actions succeeded and which need attention.
9. User cannot approve with a typed “yes”; only the exact card action grants approval.
10. A Notion recovery workspace includes situation, impacts, decisions, owner/deadline/status checklist, and a valid provider link.
11. Long message bodies, ten actions, long workspace names, and cross-timezone events remain readable.
12. Provider reconnect during a draft preserves the conversation but requires options to be recomputed.

## Incremental delivery slices

### Slice 1 — UI foundation and truthful setup fixture

- Add route groups, tokens, shared controls, and the five approved screen layouts.
- Implement canonical onboarding state against a local server-backed fixture.
- Demo provider mode is visibly labeled and survives refresh.
- No production provider redirects yet.

Exit: the entire wizard is keyboard accessible, responsive, and honest about demo connections.

### Slice 2 — Real provider connection loop

- Implement signed return state, callback routes, post-return server verification, account/destination display, and reconnect paths.
- Gmail, Calendar, and Notion use real connections where configured; demo mode remains a deliberate environment choice.

Exit: all three providers pass success, cancellation, missing-permission, stale-return, and reconnect tests.

### Slice 3 — Conversational workspace, read-only first

- Turn Screen 5 into `/workspace` with composer, suggestions, conversation persistence, schedule reads, clarification, and option cards.
- Keep all suggestions read-only; label outcomes `No changes were made`.

Exit: `Prepare my week` and `Review recent changes` produce useful grounded answers without writes.

### Slice 4 — Exact confirmation and execution

- Adapt the v1 plan/approval/receipt contracts into conversation turns.
- Implement immutable confirmation cards, approval expiry/staleness, idempotent execution progress, and recovery states.

Exit: a chat proposal cannot write without card approval, and duplicate confirmation/replay creates zero new actions.

### Slice 5 — Notion follow-through workspace

- Extend artifact preview with decisions and structured checklist items.
- Upsert the same recovery page through case progress and show the verified page link in completion.

Exit: an approved disruption leaves a genuinely actionable Notion recovery workspace, not merely a receipt ledger.

### Slice 6 — Product polish and demo hardening

- Finish empty/partial/error states, connection settings, analytics, reduced motion, responsive QA, and two-minute demo seed/reset paths.
- Remove every dead control and link shell; unsupported actions are absent or clearly disabled with explanation.

Exit: full UI test matrix passes in demo and real-provider modes, and reset restores the baseline without deleting unrelated user data.

## Frontend acceptance gate

- The five-step flow matches the approved visual direction on desktop and mobile.
- Every displayed real connection is server-verified; every demo connection is plainly identified.
- Screen 5 is a usable assistant entry point, not an ornamental completion page.
- Chat can explore and compare without accidental writes.
- Every write is represented in an exact, immutable confirmation card before execution.
- Notion output includes a follow-through checklist with owners, deadlines, and status.
- There are no dead buttons, placeholder hyperlinks, technical copy, or fabricated success states.
- Refresh, callback return, stale approval, partial execution, and replay are coherent and recoverable.
