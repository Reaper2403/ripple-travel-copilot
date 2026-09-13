# Ripple v2 — usability acceptance gates

**Owner:** Product manager / usability checker  
**Decision rule:** Any P0 failure blocks the demo build. P1 failures block release unless the control is removed from the demo path.  
**Audit basis:** `docs/15-v2-build-plan.md`, `planning/v2/reconciliation.md`, `docs/14-onboarding-v2-spec.md`, the v1 React source, and the v2 static flow. The local servers were unavailable during this initial audit, so runtime interaction must be repeated after the first integrated build.

## Current-state blockers

- **P0 — Monolithic v1 surface:** the current production UI opens directly on a recovery case; it does not provide the agreed onboarding or conversational workspace.
- **P0 — Dead or shell controls:** `Gmail source` is deliberately non-interactive, while `Edit plan`, `Reject plan`, and `Technical details` are disabled. These controls must become real or disappear; disabled product promises do not count as features.
- **P0 — V1 copy remains developer-facing:** `Synthetic demo`, case IDs/versions, `Blast radius`, `Exact actions`, `Approval boundary`, `Executing safely`, `Failed safely`, receipt terminology, replay terminology, and benchmark language must not leak into the executive flow.
- **P0 — Static mockup is not product behavior:** every apparent field, button, suggestion, connection, destination, composer, status, and link in `design/v2-onboarding/` must be bound to a real or explicitly labelled fixture state before it can appear in the app.
- **P0 — Monitoring claim:** show `Monitoring is on` only when a recent server heartbeat proves the watcher is active. Otherwise say `Monitoring is paused` with a working recovery action, or omit the claim.
- **P1 — Conflicting onboarding concepts:** Screen 1 is a single-operator server session in v2, not a real SaaS account-creation flow. Do not ask for editable name/email fields or claim an account was registered unless that capability exists.

## Global gates

### Truth and comprehension — P0

- A first-time evaluator can answer within 10 seconds: **Ripple finds schedule risk, proposes a response, and acts only after approval.**
- `Connected` appears only after a successful server-side provider identity and capability check. A timer, popup close, query parameter, or client cache cannot create it.
- Preconfigured-provider flow says **Checking your connection…**, never **Opening Google…**, **Choose an account**, or other copy that implies a consent flow occurred.
- Demo/fixture states are labelled **Demo workspace** and never use a fabricated identity or unqualified `Connected` badge.
- Every provider result shows a safe, provider-derived identity or destination; tokens, scopes, endpoints, internal IDs, hashes, and raw provider errors are never exposed.
- All dates and times include enough context to prevent ambiguity: day, local time, timezone, and duration where relevant.
- The primary action on every screen states the immediate outcome. No screen presents two competing primary actions.

### Navigation and recovery — P0

- Refresh resumes the first incomplete step without losing verified connections or creating duplicate provider activity.
- Back preserves completed steps and never disconnects an integration.
- Forward navigation to an incomplete step is blocked server-side, with a plain-language explanation.
- A failed provider affects only its own card; earlier successful connections remain visibly safe.
- Retry is available on the same screen and retains the user’s previous safe selection.
- Browser Back/Forward, duplicate tabs, callback refresh, and an expired session never create a false success state.

### Interaction integrity — P0

- Every visible button, link, card, icon button, suggestion, menu item, and keyboard shortcut has one tested outcome.
- If an outcome is not in v2 scope, remove the control. Do not ship `href="#"`, click handlers that do nothing, tooltips explaining that a feature is unavailable, or enabled-looking `<span>` elements.
- Disabled controls are allowed only for temporary, visible prerequisites such as loading or invalid input, and must explain what unlocks them.
- Links open a real validated destination. If Gmail cannot provide a safe message link, render source evidence as text and omit the link.
- Loading prevents double submission; repeated clicks, Enter presses, and slow responses create one request and one result.
- Success is shown only after the authoritative response arrives. Errors preserve user context and state what did **not** change.

### Accessibility and responsive behavior — P0

- Complete setup, chat, option selection, confirmation, rejection, and result inspection using keyboard only.
- Focus moves to the new screen heading after route changes and to the error summary after a failed action; retry returns focus to the initiating control.
- Loading, connection, proposal, execution, and error changes are announced without repeatedly reading the full page.
- Provider status is conveyed by text and icon, not color alone; focus indicators meet 3:1 contrast and text meets WCAG AA.
- At 390 px there is no horizontal scrolling, clipped copy, hidden confirmation detail, or off-screen primary action.
- Reduced motion removes nonessential transitions and indefinite decorative animation.

## Screen-by-screen acceptance

### 1. Welcome / operator session

**P0 blockers**

- Heading and promise explain the value and approval boundary without mentioning OAuth, APIs, pipelines, agents, or tokens.
- The screen reflects v2 reality: **Continue as [masked provider identity]** or equivalent verified-session action. Do not show fake editable sign-up fields or terms acceptance for an account system that does not exist.
- Primary action creates/resumes one server-owned session and routes to Email only after success.
- Loading copy: **Preparing your workspace…**; the button is disabled and retains its width.
- Failure copy states that no integrations were changed and offers **Try again**.
- An identity mismatch shows the masked configured identity and a truthful recovery instruction; do not offer account switching unless implemented.
- Existing onboarding state offers **Resume setup** and starts at the first incomplete step.

**P1 quality bar**

- One concise trust statement; no long marketing sidebar on narrow screens.
- `Save and exit` appears only after a resumable profile exists and routes somewhere useful.

### 2. Gmail

**P0 blockers**

- Explain only the supported value: find relevant labelled notices, show evidence, and send a fully previewed disruption update after approval.
- Primary action starts a real server verification. Copy while running: **Checking your Gmail connection…**
- Success shows the provider-returned masked identity and verified capability summary.
- Cancelled/missing permission, revoked credential, wrong configured account, timeout, and provider outage have distinct plain-language states.
- `Use a different account` is absent until real account switching exists.
- **Continue to Calendar** remains unavailable until verification succeeds.
- Any `From Gmail` source control in the later workspace either opens the validated source or is rendered as non-interactive evidence text.

**P1 quality bar**

- Permission language is outcome-led and does not enumerate raw scope strings.
- Sending safety appears once, prominently: Ripple shows recipients and full message before approval.

### 3. Google Calendar

**P0 blockers**

- Explain conflict detection, preparation time, buffers, and new Ripple-owned holds; explicitly state that existing meetings will not be moved or cancelled.
- Loading copy: **Checking your calendars…** and a visible selector skeleton.
- Calendar choices are provider-derived and show name, access level, and primary status without exposing IDs.
- With multiple writable calendars, the user must confirm the selection; with one, it is selected visibly.
- Read-only calendars cannot be selected. No writable calendar, missing permission, revocation, timeout, and outage each produce a recoverable state.
- Success requires a bounded read and verified write role, then shows the selected calendar name.
- **Continue to Notion** is unavailable until a writable calendar is confirmed.

**P1 quality bar**

- Changing selection before completion does not repeat identity verification unnecessarily.
- Private-event handling is explained without claiming privacy behavior the context assembler does not enforce.

### 4. Notion

**P0 blockers**

- Frame Notion as the executive follow-through workspace: decisions, owners, deadlines, and next actions—not a recovery log.
- Show provider-derived workspace and exact parent-page breadcrumb.
- The primary action verifies retrieve and create-under-parent capability; progress copy: **Checking your Notion workspace…**
- Do not show `Choose another page` unless a real destination picker is available. With a preconfigured page, say where plans will be created and provide a working **Check again** recovery.
- Parent not shared, read-only destination, missing/archived page, wrong workspace, revoked integration, timeout, and provider outage are distinct.
- Success copy promises only child-page creation and preservation of unrelated content.
- **Finish setup** is unavailable until the destination is verified.

**P1 quality bar**

- A short preview names the resulting sections: `At a glance`, `Affected commitments`, `Next actions`, and `Decisions`.
- The selected destination is easy to distinguish from the workspace name.

### 5. Handoff and assistant workspace

**P0 blockers**

- This is a functional workspace, not a completion card. The composer accepts text, Enter submits, Shift+Enter adds a line, and the send action has an accessible name.
- The three starters run real behavior:
  - **Prepare my week** reads the current Calendar and returns grounded pressure points.
  - **Review recent changes** reads eligible Gmail evidence and clearly handles no result.
  - **Show how approval works** creates a labelled synthetic preview and stops before execution.
- Connection summary opens a real management/recovery surface, or it is non-interactive status text. `Manage connections` cannot be a shell.
- Assistant loading states distinguish `Checking your schedule`, `Comparing options`, and `Preparing an exact preview`; cancel/retry never submits twice.
- Unsupported or ambiguous prompts get a useful boundary plus supported next choices, not a generic error or invented plan.
- A grounded answer cites the relevant dates/events without exposing private descriptions unnecessarily.
- Option cards show the outcome, trade-off, affected commitments, assumptions, and whether anything remains manual.
- Selecting or refining an option performs zero writes. Typing `yes`, `approve`, or `do it` performs zero writes.
- Material refinement creates a visibly new proposal version and invalidates the older confirmation target.
- **Reject plan** is functional, terminal, and produces no provider action; after rejection offer **Explore another option**.

### Exact confirmation and results

**P0 blockers**

- The confirmation view is visually distinct from chat and names every effect grouped by Notion, Calendar, and Gmail.
- Calendar preview shows title, date, start/end, timezone, target calendar, and whether guests are affected.
- Notion preview shows destination, page title, summary, decisions, and every task’s owner, deadline/timezone, and initial status.
- Gmail preview shows full recipients, subject, and body—not a summary or truncated shell.
- The confirmation action states the count and effect, e.g. **Approve and make 2 updates**. A separate **Not now** or **Reject plan** works.
- The server-supplied manifest is immutable in this view; any edit returns to proposal revision and requires a new preview.
- Stale/expired/tampered confirmation never executes. Copy: **Something changed. Review the refreshed plan before continuing.**
- Execution progress does not imply success. Each provider becomes complete only after a verified receipt.
- Partial and unknown outcomes name what completed, what stopped, what did not run, and the safe next action.
- Result links open the exact validated Calendar item and Notion tracker. Do not expose a receipt link unless it resolves.
- Double confirmation, reload during execution, and replay produce no duplicate page, task, hold, or email.

## Notion usefulness gate — P0

A real golden-path tracker must be understandable without Ripple open:

- Page title describes the executive subject, not an internal case ID.
- `At a glance` gives status, chosen decision, impact, next deadline, and last updated.
- `Affected commitments` names the relevant time and response without copying private event content unnecessarily.
- `Next actions` contains at least two useful tasks with visible owner, deadline/timezone, and status.
- `Decisions` explains what was chosen and what remains manual.
- Safe Calendar/Ripple links work; technical hashes, provider payloads, and receipt logs are absent.
- Replay does not duplicate content, and reconciliation preserves human blocks and manually changed checkboxes.

## No-dead-control sweep — P0

Before each demo rehearsal, enumerate all interactive elements on every routed screen and verify:

- destination or state transition;
- loading lock and duplicate-click behavior;
- keyboard activation and focus result;
- success authority and error recovery;
- narrow-screen reachability.

Specific controls that must be proven or removed: logo/home, Save and exit, Back, every provider connection/retry action, calendar radio cards, Notion destination/change action, Finish setup, composer send, all three prompt starters, every proposal option, refine/edit, exact confirmation, reject/not now, retry, source evidence, Calendar result, Notion result, connection management, monitoring recovery, account/avatar menu, and any footer/help link.

## Two-minute demo usability gate — P0

Run three consecutive rehearsals from a clean, restored fixture. A pass requires all of the following:

| Time | Audience takeaway | Observable proof | Failure condition |
|---|---|---|---|
| 0:00–0:20 | Ripple is connected and trustworthy | Three real verified identities/destinations; land directly in the workspace | Setup stalls, fake OAuth language, or unexplained configuration UI |
| 0:20–0:45 | Ripple understands a real executive week | **Prepare my week** surfaces one seeded, meaningful pressure point | Hard-coded prose, vague summary, or no source/date grounding |
| 0:45–1:10 | The executive keeps agency | Two clear options with a visible trade-off; select one | Options are indistinguishable or selection causes a write |
| 1:10–1:30 | Approval is exact | Calendar and Notion effects are fully previewed; explicit confirmation once | Presenter must explain hidden effects or hunt for the button |
| 1:30–1:50 | The result is real and useful | Open the new Calendar hold and non-empty Notion tracker with owners/deadlines | Broken link, blank page, duplicate artifact, or unverified success |
| 1:50–2:00 | The product thesis is memorable | `Ripple turns schedule pressure into an approved, accountable plan.` | Closing relies on technical architecture or benchmark jargon |

Operational requirements:

- The golden path uses Calendar + Notion; Gmail sending may be shown only if it reliably fits the timebox and full message preview.
- No presenter step depends on scrolling past multiple panels, copying IDs, editing configuration, opening developer tools, or explaining a disabled control.
- Primary demo actions remain visible at the target projector resolution and 125% browser zoom.
- Seed/reset restores the exact Calendar baseline and removes only marked Ripple fixtures.
- Rehearsal includes one recovery drill: provider needs attention, stale proposal, or safe partial failure must be understandable in under 15 seconds.
- Three runs finish within two minutes with no manual data repair between reset and start.

## PM sign-off checklist

- [ ] All P0 gates above have test evidence.
- [ ] No unsupported feature is implied by visible copy.
- [ ] Every `Connected`, `Monitoring`, and `Completed` claim is server-backed.
- [ ] Every visible control passes the no-dead-control sweep.
- [ ] Notion tracker passes the standalone usefulness test.
- [ ] Exact confirmation and rejection both produce the expected zero/approved side effects.
- [ ] Keyboard, screen reader, reduced motion, 390 px, projector resolution, and 125% zoom pass.
- [ ] Repository and screenshots contain no real personal addresses, messages, tokens, or provider payloads.
- [ ] Three clean two-minute rehearsals pass after reset.
- [ ] Runtime audit is repeated against the integrated v2 build; source review alone is insufficient.
