# Ripple v2 product plan

**Owner:** Product management  
**Status:** Planning draft for engineering negotiation  
**Product outcome:** Ripple becomes a credible executive scheduling assistant: it connects the user's working tools, explores schedule options conversationally, and turns confirmed decisions into accountable follow-through.

## Executive decision

Ship three connected experiences in v2:

1. A five-step, resumable onboarding flow that shows verified Gmail, Calendar, and Notion identities.
2. A useful Notion executive follow-through tracker with actions, owners, deadlines, and status—not an execution ledger.
3. A conversational workspace where the executive can ask scheduling questions, compare options, and explicitly confirm an exact action plan before Ripple writes anything.

The v2 demo must use the credentials already configured on the server and show genuine provider-derived connection details. It does **not** need to implement a full multi-user OAuth platform. If an integration is already configured for this hackathon deployment, onboarding may use a server-verified “Connect” flow that confirms the account or workspace and persists onboarding state. The interface must never imply that a simulated provider consent occurred.

## Product principles

- **Conversation for exploration; structured review for commitment.** Chat can suggest, explain, and refine. It cannot itself authorize side effects.
- **One confirmation, one exact manifest.** A confirmation names the Calendar, Notion, and Gmail effects it permits. Any material edit invalidates it.
- **Notion is the coordination home.** Receipts remain internal proof; the Notion page is designed for the executive and collaborators.
- **Real status, plain language.** A masked, provider-returned account identity is useful. Tokens, scopes, endpoints, hashes, and provider modes are not customer copy.
- **Honest incompleteness.** A disabled or guided feature is labeled as such; fake success states are forbidden in the production route.
- **Executive signal density.** Every screen answers “what needs my attention, what are my options, and what happens next?”

## Prioritized feature scope

### P0 — v2 must ship

| Capability | Product behavior | Acceptance signal |
|---|---|---|
| Resumable onboarding | Five full-page steps with `Step X of 5`, Back, persistent completion state, loading/error/retry states | Refresh returns to the first incomplete step; Back does not disconnect anything |
| Account identity | Existing Google identity is verified and presented as the Ripple operator | UI shows a masked, server-derived identity; no email is hard-coded in the client |
| Gmail connection | Connection check confirms the configured Gmail account and required read/send permissions | Success appears only after a server-side profile/permission check |
| Calendar connection | Connection check lists/identifies the selected writable calendar and verifies bounded read access | Selected calendar name is provider-derived and persists |
| Notion connection | Connection check verifies the configured workspace destination/page and create access | UI shows the real destination name; permission failure has a useful recovery path |
| First-run handoff | Step 5 opens the conversational workspace with connection summary and useful starter prompts | The user can start a real schedule exploration immediately |
| Conversational schedule exploration | User asks about their week, conflicts, prep time, or a schedule change; Ripple reads a bounded calendar window and returns grounded options | Answer names the time window and relevant events without exposing private content unnecessarily |
| Proposal cards in chat | Actionable responses render 1–3 structured options rather than burying decisions in prose | Each option shows trade-off, affected commitments, assumptions, and exact proposed effects |
| Explicit confirmation | Selecting an option opens an approval card/drawer with exact effects; execution requires a separate confirm action | Sending a chat message, selecting a suggestion, or clicking an option cannot write externally |
| Safe execution | Confirmed chat plans reuse the v1 immutable manifest, approval, ordered saga, idempotency, and receipt model | Notion runs first, Calendar second, Gmail last; replay creates no duplicates |
| Notion follow-through tracker | An approved recovery creates or updates a human-readable tracker with summary and action items | Page contains owners, deadlines, statuses, and source/meeting context—not raw technical receipts |
| Rejection/cancel | User can reject or close a proposed plan without any external write | State becomes dismissed; the chat confirms that nothing changed |
| Productized failure states | Auth loss, no results, stale schedule, partial provider failure, and unknown outcome have plain-language next actions | Failure never looks like success and never silently retries an uncertain side effect |

### P1 — include only after the P0 path is reliable

- Mark follow-through items complete in Ripple and update the same Notion page.
- Continue a conversation to alter an owner, deadline, message tone, or recovery hold; create a new plan version and require new confirmation.
- Show the most recent open recovery trackers in the workspace.
- Auto-apply the Gmail intake label using a narrow, user-visible Gmail filter/rule for known travel senders and disruption keywords.
- Proactive “Ripple found something” cards while the local watcher is running.
- Reconnect/change-account flows that launch fresh provider OAuth from the product.

### P2 / v3

- Production multi-tenant OAuth, encrypted per-user token storage, revocation, account switching, and organization administration.
- Background Gmail push notifications with durable cloud workers; v2 may use the existing local watcher for the demo.
- Free-form chat that can compose arbitrary new tools/actions. v2 supports a constrained scheduling intent catalog.
- Automatic meeting moves/cancellations, travel purchases, or other high-consequence actions.
- Notion database installation/migration across arbitrary customer schemas.
- Team delegation, Slack/Teams, recurring executive routines, mobile notifications, and enterprise policy ingestion.

## Integration truth model

### What must be genuine in v2

- Gmail identity and required capabilities are verified by the backend.
- The chosen Calendar is verified and schedule answers use its current, bounded event data.
- The displayed Notion destination is retrieved from Notion and accepts a safe capability check.
- A confirmed golden-path plan creates or updates a real Notion tracker and a real Calendar hold; Gmail sends only to the configured demo allowlist.
- Provider receipt links/identifiers come from completed provider calls.

### What may be constrained or simulated honestly

- **Account creation:** for the hackathon, one preconfigured operator can “Continue with Google” into a verified local profile. Call this a demo workspace in technical notes, not in primary product copy.
- **OAuth handoff:** if full reconnect OAuth is too costly, the Connect action may verify the preconfigured integration and animate the verified state. Its loading copy should say `Checking your connection…`, not `Signing in to Google…`.
- **Assistant language:** starter intents and deterministic fixtures may be used as fallbacks. When fixture data is used, label the conversation `Guided example` and never present external writes as real.
- **Proactive monitoring:** polling via the existing watcher is acceptable for v2 demo operations. The product may say `Monitoring is on` only while the watcher health check is current; otherwise say `Monitoring is paused`.

### What must not be faked

- Connected identities, workspace/page names, provider success, receipts, sent messages, created events, or Notion updates.
- A consent dialog or account chooser that does not actually authorize anything.
- A chat confirmation animation when the server did not accept and execute the corresponding immutable manifest.

## Primary user journeys

### Journey A — first-time setup

1. User opens Ripple and sees its outcome: protect the schedule when plans change.
2. User creates/verifies the Ripple account.
3. User connects Gmail after seeing exactly why it is needed and when sending is allowed.
4. User connects/selects Calendar after seeing how it supports conflict detection and recovery time.
5. User connects Notion and confirms the destination for recovery trackers.
6. Ripple shows all three verified identities and hands the user into the assistant.
7. The assistant offers `Prepare my week`, `Review recent changes`, and `Show how approval works`.

**Success:** the user reaches a useful prompt without encountering configuration jargon or a dead-end success page.

### Journey B — prepare my week

1. User selects `Prepare my week` or asks a similar question.
2. Ripple states the bounded period it is checking and reads Calendar.
3. Ripple returns an executive summary: high-pressure transitions, missing preparation time, and optional protection opportunities.
4. Purely informational findings are answered directly. Actionable findings include structured options such as `Protect 30 minutes before the board review`.
5. User selects an option, reviews the exact Calendar hold and optional Notion follow-through item, and confirms.
6. Ripple executes and posts provider-backed completion in the thread.

**Success:** chat provides value even when the user chooses to make no change.

### Journey C — disruption recovery and follow-through

1. Ripple surfaces a labeled travel-change notice or the user asks to review it.
2. Ripple explains what changed and which commitments are affected.
3. User explores alternatives conversationally: remote attendance, protected recovery time, or stakeholder updates.
4. Ripple renders a recommended proposal with explicit assumptions and an exact-action preview.
5. User confirms.
6. Ripple upserts the Notion tracker, applies the Calendar change, and sends approved email last.
7. Chat shows a compact result and a link to the ongoing tracker.

**Success:** the user leaves with both an immediate recovery and an accountable next-action list.

### Journey D — reject or revise

1. User selects `Not this plan` or asks for a change.
2. If rejecting, Ripple closes the proposal and confirms `Nothing was changed.`
3. If revising, Ripple builds a new proposal and invalidates the old approval target.
4. The user reviews and confirms the new manifest independently.

**Success:** conversational iteration never weakens the approval boundary.

## Screen-by-screen product contract

### Screen 1 — Account

- **Primary state:** outcome-led welcome and `Continue with Google`.
- **Loading:** `Creating your workspace…`; primary disabled.
- **Success:** masked operator identity and automatic progression.
- **Errors:** verification failed, different account required, local profile unavailable.
- **Trigger:** advance only when the backend has created a resumable onboarding profile tied to the verified identity.

### Screen 2 — Gmail

- **Primary state:** permission explanation and `Connect Gmail`.
- **Verification state:** `Checking your Gmail connection…`.
- **Success:** Gmail identity plus `Connected` and `Continue to Calendar`.
- **Errors:** authorization expired, missing read/send access, wrong account, provider unavailable.
- **Trigger:** server-side profile/capability verification; client query parameters cannot mark success.

### Screen 3 — Calendar

- **Primary state:** value explanation and `Connect Calendar`.
- **Loading:** calendar selector skeleton.
- **Success:** selected real calendar name, writable indicator, and `Continue to Notion`.
- **Errors:** no writable calendar, bounded read denied, expired connection.
- **Trigger:** successful bounded snapshot plus confirmed selected calendar.

### Screen 4 — Notion

- **Primary state:** describe the follow-through tracker, not “artifact output.”
- **Selection:** show real workspace/destination breadcrumb where available.
- **Verification:** `Checking where Ripple can create follow-through trackers…`.
- **Success:** `Future recovery trackers will appear in [destination].`
- **Errors:** page not shared, read-only destination, missing parent, expired authorization.
- **Trigger:** retrieve destination metadata and verify safe child-page creation capability. Avoid leaving a junk page; use a create/archive probe only if the API offers no non-writing verification.

### Screen 5 — Assistant workspace

- **Header:** greeting, compact connection summary, monitoring state.
- **Primary content:** chat composer and three starter prompts.
- **Conversation states:** empty, thinking, answer, grounded findings, proposal, approval review, executing, complete, partial failure.
- **Connection recovery:** an affected integration shows `Needs attention` without blocking questions that do not require it.
- **Trigger:** entering the workspace does not start external actions.

## Conversational assistant contract

### Supported v2 intents

| Intent | Reads | Possible proposed writes |
|---|---|---|
| Prepare my week | Calendar, user timezone | Calendar prep/recovery hold; Notion follow-through items |
| Find conflicts around an event/trip | Calendar and selected Gmail evidence | Calendar hold; stakeholder update; Notion tracker |
| Review recent changes | Narrow Gmail label/query and bounded Calendar window | Recovery proposal only |
| Protect preparation time | Calendar | Calendar hold; optional tracker item |
| Explain a proposal | Current case/plan | None |
| Revise a proposal | Current unexecuted plan | New immutable proposal version |

Out-of-scope prompts receive a useful boundary: `I can help analyze your schedule, protect preparation time, and coordinate approved recovery actions. I can’t book travel or move meetings automatically.`

### Response anatomy

1. **Answer first:** one-sentence executive summary.
2. **Grounding:** relevant date range and up to three affected commitments.
3. **Options:** 1–3 choices with trade-offs.
4. **Proposal:** only when writes could help; exact effects grouped by app.
5. **Confirmation:** separate primary action: `Confirm these N actions`.

### Confirmation rules

- Natural-language replies such as “yes,” “do it,” or “looks good” may select a proposal but must still surface the structured confirmation control in v2.
- Confirmation is rejected if Calendar or source evidence changed since the proposal was formed.
- The user can remove an optional action before confirmation; this produces a newly hashed plan version.
- Email recipients and content, Calendar title/time/calendar, and Notion tracker destination/items are visible before confirmation.
- The assistant never claims completion until verified provider receipts exist.

## Notion executive follow-through tracker

### Purpose

Give the executive and their team a living operational view after the initial scheduling decision. Technical receipts remain in Ripple; Notion captures responsibility and progress.

### v2 page shape

**Title:** `Recovery — [trip/change] — [date]`

1. **At a glance** — status, decision, impact, next deadline, last updated.
2. **What changed** — concise source-backed summary with sensitive identifiers masked.
3. **Affected commitments** — meeting, time, owner/host, impact, chosen response.
4. **Follow-through** — task rows with action, owner, due date/time, and status (`Not started`, `In progress`, `Done`, `Blocked`).
5. **Decision log** — human-readable decisions and timestamps, not hashes or request payloads.
6. **Links** — affected Calendar items and relevant Ripple case.

### Minimum action-item schema

```ts
interface FollowThroughItem {
  id: string;
  caseId: string;
  title: string;
  ownerLabel: string;
  dueAt?: string;
  timezone?: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "BLOCKED";
  relatedEventRef?: string;
}
```

For the hackathon, render these as structured page sections/checklist blocks inside the existing configured parent page. A full Notion database with property synchronization is P1/v3 unless it is demonstrably simpler with the current workspace.

### Idempotency and update behavior

- One tracker per case; retain the provider page ID after first creation.
- Re-execution updates the same page or no-ops; it never creates a second tracker.
- Plan revisions append/replace only the Ripple-owned follow-through section and preserve unrelated human edits.
- Status changes must be explicit and attributable; do not infer `Done` from an email being sent unless the task specifically represents sending that email.

## Acceptance criteria by outcome

### Onboarding

- All five steps render at desktop and 390 px without horizontal overflow.
- Keyboard and screen-reader users can identify current step, loading, error, and success.
- Completed steps persist through refresh and server restart in the hackathon environment.
- No connection success is client-authored or hard-coded.
- Already-connected integrations take no more than one verification action per screen.

### Assistant

- `Prepare my week` returns a provider-grounded response from a bounded calendar query.
- At least one schedule prompt produces two meaningful options and one reviewable action manifest.
- Chat history distinguishes user text, Ripple analysis, proposed plan, confirmation, and provider result.
- A chat message alone causes zero external writes.
- Reject causes zero external writes and visibly closes the proposal.
- A stale schedule prevents execution and asks the user to review the updated proposal.

### Notion tracker

- Golden path creates one non-empty tracker containing at least two follow-through items with owners, deadlines, and statuses.
- A replay creates zero additional pages and zero duplicate action items.
- The tracker is understandable without reading Ripple or technical receipts.
- Provider failure prevents Calendar/Gmail continuation under the existing saga rules.
- The returned Notion destination/page link opens the real object.

### Demo integrity

- Every visible connected identity, event, tracker, and completion state is provider-backed.
- Guided-example data is visibly labeled and cannot message real stakeholders.
- Real-mode execution remains restricted to the configured allowlist.
- The flow can be reset without changing the user's pre-existing calendar items or deleting non-Ripple Notion content.

## Two-minute v2 demo narrative

**Top-line:** “Ripple turns an overloaded week into an approved, accountable plan across Calendar, Gmail, and Notion.”

| Time | Beat | What the audience learns |
|---:|---|---|
| 0:00–0:12 | Start at completed onboarding summary; the three real connections are named | This is a connected product, not a mock integration gallery |
| 0:12–0:28 | Enter assistant and click `Prepare my week` | The workspace is useful before a disruption occurs |
| 0:28–0:48 | Ripple highlights a tight transition and missing prep time, then offers two options | It reasons over an executive's real constraints |
| 0:48–1:08 | Choose an option; exact Calendar and Notion follow-through effects appear | Conversation becomes a controlled, inspectable plan |
| 1:08–1:20 | Confirm via the separate approval control | The user—not the chat model—authorizes the exact effects |
| 1:20–1:40 | Receipt rail verifies Notion first and Calendar second; open the tracker briefly | Notion holds owners, deadlines, and progress, not merely logs |
| 1:40–1:54 | Ask `What still needs attention?`; Ripple answers from the tracker/current schedule | The page participates in ongoing executive follow-through |
| 1:54–2:00 | Close on `2 actions verified · nothing sent without approval` | Utility and control are memorable |

If network conditions make onboarding consent slow, begin with the already-verified completion screen and keep the full onboarding flow available for Q&A. Do not spend demo time walking through five permission screens.

## Risks and mitigations

| Risk | Mitigation / cut |
|---|---|
| Full SaaS OAuth consumes the hackathon | Verify the existing server integrations in v2; move account switching/token lifecycle to v3 |
| Chat expands into an unbounded agent | Use a small intent catalog and structured proposal schema; graceful boundary for unsupported requests |
| Notion blocks become costly to update safely | Own a clearly marked Ripple section; P0 creates a structured page, P1 adds bidirectional status edits |
| Sensitive event details leak into Notion/chat | Respect private/opaque event visibility; display time and generic busy state where needed |
| “Yes” accidentally executes | Require the explicit structured confirmation button for v2 |
| Stale chat proposal writes against a changed week | Reuse v1 snapshot hashes and just-in-time validation |
| Watcher is mistaken for durable monitoring | Show monitoring on only with a current health heartbeat; document local/demo limitation |
| Onboarding delays the strong product demo | Demo begins at verified handoff; onboarding screens support product credibility and Q&A |
| Scope fractures the reliable v1 saga | Reuse v1 cases, manifests, approvals, and receipts; chat is a new proposal entry point, not a new executor |

## Hackathon-fit cuts, in order

If time is constrained, cut in this order:

1. Notion status edits from Ripple after initial tracker creation.
2. Free-text revision of owners/deadlines; retain prebuilt option selection.
3. Proactive watcher UI and auto-label rules; retain manual `Review recent changes`.
4. Fresh OAuth reconnect/account switching; retain genuine verification of configured integrations.
5. Chat persistence across browser/server restarts; retain onboarding persistence and execution journal.

Never cut the explicit confirmation boundary, provider-derived connection status, Notion tracker content, idempotent execution, or the ability to reject with no side effects.

## Product release gates

v2 is demo-ready only when:

- all five onboarding steps have default/loading/success/error behavior;
- the three integration summaries are server-verified;
- `Prepare my week` works against seeded executive-calendar edge cases;
- one conversational proposal can be rejected and one can be confirmed;
- the confirmed plan produces a non-empty, useful Notion follow-through tracker;
- replay produces no duplicate Notion page, Calendar event, or Gmail message;
- fixture reset restores only Ripple-owned objects;
- the full test suite and the existing safety benchmark pass;
- three rehearsals finish in under two minutes without exposing personal details or technical configuration.

## Recommendation to engineering

Preserve v1 as the execution kernel and build v2 as two thin layers around it:

1. **Setup layer:** persistent onboarding state plus provider capability/identity verification.
2. **Conversation layer:** intent classification and schedule exploration that outputs the existing structured recovery-plan/manifest contract.

Extend `ArtifactAction` to carry structured follow-through items rather than teaching the chat layer to write arbitrary Notion blocks. This keeps the Notion adapter deterministic, makes the approval preview exact, and lets the existing idempotency and receipt protections cover the new experience.
