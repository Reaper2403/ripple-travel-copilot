# Ripple v2 onboarding and product-language specification

Status: design proposal only; no implementation is authorized until mockup review.  
Audience: product design, frontend, backend integrations, QA.

## Product direction

Use a dedicated, full-page setup route rather than a modal. Gmail, Calendar, and Notion connections may leave Ripple for provider consent and return asynchronously; a URL-addressable sequence is easier to resume, test, and make accessible than a modal that tries to survive redirects.

The experience should feel like setting up a trusted executive assistant:

- one decision per screen;
- value before permissions;
- progressive consent instead of one intimidating authorization request;
- plain-language confirmation of the connected account/workspace;
- persistent progress after every completed step;
- no technical status vocabulary in the customer interface;
- a useful first action immediately after setup.

## Flow and state model

```text
/welcome
   ↓ account created
/setup/email
   ↓ Gmail connected and verified
/setup/calendar
   ↓ Calendar connected and verified
/setup/knowledge
   ↓ Notion workspace selected and verified
/setup/complete
   ↓ Enter Ripple
/workspace
```

The server owns the canonical onboarding state:

```ts
type OnboardingStep = "account" | "email" | "calendar" | "knowledge" | "complete";
type ConnectionState = "not_started" | "connecting" | "connected" | "needs_attention";

interface OnboardingProfile {
  userId: string;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  gmail: { state: ConnectionState; maskedIdentity?: string };
  calendar: { state: ConnectionState; calendarName?: string };
  notion: { state: ConnectionState; workspaceName?: string };
  updatedAt: string;
}
```

Client query parameters may communicate a provider return result, but they never become the source of truth. After every redirect, the server verifies the connection before marking a step complete.

## Shared wizard behavior

- Header: Ripple wordmark, `Step X of 5`, and a quiet **Save and exit** action after account creation.
- Progress: five labeled dots on desktop; compact progress bar plus current label on mobile.
- Content width: 480–560 px for primary decisions; no dashboard behind the wizard.
- Primary action: one high-emphasis button aligned consistently.
- Secondary action: **Back** beginning on step 2. Back never disconnects an integration.
- State persistence: save immediately after a verified connection and resume at the first incomplete step.
- Keyboard: logical heading order, visible focus, Enter activates the primary action, Escape does not discard setup.
- Motion: 160–220 ms transitions; honor reduced-motion preferences.
- Errors: preserve the current screen, state what remains unchanged, and offer one recovery action.
- Provider names and identities: show the connected account or workspace in a confirmation row; never display tokens, scopes, client IDs, endpoints, or API language.

## Screen 1 — Account creation

### Purpose

Create a Ripple identity without prematurely requesting mailbox or Calendar access.

### Default

- Eyebrow: `Welcome to Ripple`
- Heading: `Your schedule can recover itself.`
- Supporting copy: `Ripple spots the meetings affected by travel changes and prepares a safe response for your approval.`
- Primary: **Continue with Google**
- Trust note: `This first step only creates your Ripple account. You’ll choose which apps to connect next.`
- Existing customer: **Sign in**

### Inputs

- Google identity through basic `openid`, `email`, and `profile` access.
- Terms/privacy acknowledgement may sit below the primary action.

### Loading

- Disable the primary button.
- Button label: `Creating your workspace…`
- Do not show a generic full-screen spinner.

### Error

- Title: `We couldn’t create your workspace.`
- Body: `Nothing was connected. Try again, or use a different Google account.`
- Primary recovery: **Try again**

### Transition

Move to `/setup/email` only after the server has created the user and a resumable onboarding profile.

## Screen 2 — Email integration

### Purpose

Explain why Ripple reads travel-change messages and sends only approved updates.

### Default

- Eyebrow: `Step 2 of 5 · Email`
- Heading: `Spot travel changes as they arrive.`
- Supporting copy: `Connect Gmail so Ripple can find delays and cancellations, then draft updates for the people affected.`
- Permission summary:
  - `Read likely travel-change messages`
  - `Show the exact message evidence it used`
  - `Send an update only after you approve it`
- Control note: `Ripple never sends from your account without showing you the recipients and message first.`
- Primary: **Connect Gmail**

### Loading

- Button label: `Connecting Gmail…`
- Preserve the explanation while the provider window opens.

### Success

- Confirmation row: Gmail icon, masked identity, green `Connected` status.
- Primary becomes **Continue to Calendar**.

### Error variants

- Consent cancelled: `Gmail wasn’t connected. No mailbox access was granted.`
- Missing permission: `Ripple needs permission to find travel updates and send only the messages you approve.`
- Wrong account: show the connected masked identity and **Use a different account**.
- Expired return: `The connection took too long. Start again to continue.`

### Transition

Proceed only after a server-side Gmail profile read succeeds and required permissions are present.

## Screen 3 — Schedule integration

### Purpose

Frame Calendar as impact detection and safe time protection, not generic synchronization.

### Default

- Eyebrow: `Step 3 of 5 · Schedule`
- Heading: `See what a delay puts at risk.`
- Supporting copy: `Ripple checks the commitments around your arrival, highlights conflicts, and can protect recovery time after you approve.`
- Value examples: `Meeting conflicts`, `Preparation time`, `Recovery blocks`
- Control note: `Existing meetings are never moved or cancelled automatically.`
- Primary: **Connect Google Calendar**

### Calendar selection

If more than one writable calendar is available, show radio cards with calendar name, owner indicator, and `Primary` badge. Default to the user’s primary calendar but require confirmation.

### Loading

- Button label: `Checking your calendars…`
- Use a three-row skeleton for the selector.

### Success

- Confirmation row: selected calendar name and `Connected`.
- Primary: **Continue to Notion**

### Error variants

- No writable calendar: `We found your calendars, but none can accept Ripple recovery blocks.`
- Permission missing: `Ripple can’t check conflicts yet. Reconnect Calendar and allow event access.`
- Provider unavailable: `Google Calendar is temporarily unavailable. Your Gmail connection is safe.`

### Transition

Proceed only after Ripple can read a bounded event window and confirms the selected calendar identity.

## Screen 4 — Knowledge base

### Purpose

Explain the durable recovery brief and make the destination unambiguous.

### Default

- Eyebrow: `Step 4 of 5 · Knowledge base`
- Heading: `Keep every recovery plan in one place.`
- Supporting copy: `Connect Notion so Ripple can create a concise brief with the disruption, affected commitments, and approved next steps.`
- Primary: **Connect Notion**

### Workspace selection

- Show workspace icon, workspace name, and the selected destination page.
- Label: `Recovery briefs will be created inside`
- Destination card: workspace → parent page breadcrumb.
- Change action: **Choose another page**

### Loading

- Button label: `Connecting Notion…`
- After provider return: `Confirming your workspace…`

### Success

- Confirmation row includes workspace and parent page.
- Primary: **Finish setup**

### Error variants

- Parent not shared: `Ripple can’t use this page yet. Share it with the Ripple integration, then try again.`
- Read-only destination: `Choose a page where Ripple can create recovery briefs.`
- Workspace changed: `That workspace is no longer available. Choose another destination.`

### Transition

Proceed only after Ripple verifies the exact parent page and its ability to create a child page. For the hackathon, Notion is required because it is part of the three-app proof; production may later allow a clearly explained skip path.

## Screen 5 — First-run handoff

### Purpose

Turn setup completion into immediate product understanding and action.

### Default

- Eyebrow: `You’re ready`
- Heading: `Ripple is watching the right places.`
- Connected summary: Gmail identity, Calendar name, Notion destination.
- Primary: **Open my workspace**
- Secondary: **Run a guided example**

### Workspace empty state

- Heading: `No travel changes need attention.`
- Body: `When a delay or cancellation arrives, Ripple will show what changed, what it affects, and the exact recovery actions waiting for your approval.`
- Three-step visual: `Notice found → Schedule checked → Plan ready`
- Primary: **Run a guided example**
- Secondary help: `How Ripple decides what matters`

### Guided-example loading

- Inline timeline progresses through `Reading the notice`, `Checking commitments`, and `Preparing options`.
- Never claim an external write. The example must stop at review.

### Error

- `Your workspace is ready, but the guided example couldn’t start. You can try it again any time.`

### Transition

**Open my workspace** routes to `/workspace`. The guided example creates an explicitly synthetic review case and never contacts stakeholders.

## Copy audit

| Screen / component | Internal / project copy | Proposed product copy |
|---|---|---|
| Environment badge | `Synthetic demo` | `Demo workspace` |
| Case status | `READY_FOR_REVIEW` / `Ready for review` | `Ready for your review` |
| Case status | `PARTIALLY_COMPLETED` | `Some updates need attention` |
| Evidence section | `What changed` | `What changed` |
| Source shell | `Open Gmail source` | `From Gmail` |
| Evidence confirmation | `Verified from email` | `Confirmed in the travel notice` |
| Impact section | `Blast radius` | `What this affects` |
| Impact count | `2 affected` | `2 commitments may be affected` |
| Plan section | `Choose a response` | `Choose how to respond` |
| Recommendation badge | `Recommended` | `Best balance` |
| Plan metadata | `Leaves manual` | `You’ll still decide` |
| Manifest section | `Exact actions` | `What Ripple will do` |
| Action count | `3 exact effects` | `3 updates for your approval` |
| Approval panel | `Approval boundary` | `You stay in control` |
| Approval explanation | `Nothing changes until you approve.` | `Review everything before Ripple makes a change.` |
| Primary approval | `Approve these 3 actions` | `Approve and make 3 updates` |
| Execution | `Executing safely` | `Making your approved updates` |
| Provider state | `Verifying` | `Confirming` |
| Failure state | `Failed safely` | `Not completed` |
| Unknown outcome | `Check manually` | `Needs your attention` |
| Receipt link | `Provider receipt` | `Confirmed in the connected app` |
| Completion | `3 of 3 actions verified.` | `All 3 updates are confirmed.` |
| Replay | `Replay same notice` | `Check for duplicate updates` |
| Replay result | `0 new actions` | `No duplicate updates created` |
| Reliability score | `11/11 Safety scenarios passed` | `All safety checks passed` |
| Fixture warning | `Actions unavailable in fixture` | `Connect your apps to continue` |
| Generic provider error | `PROVIDER_FAILURE` | `The connected app didn’t complete this update.` |
| Stale approval | `STALE_APPROVAL` | `Something changed since you reviewed this plan.` |
| Expired approval | `Approval expired` | `Review this plan again before continuing.` |
| Account placeholder | `AC` button | Static signed-in avatar until the account menu exists |
| Unsupported editing | Enabled-looking `Edit plan` | Disabled `Edit plan` with no false interaction promise |
| Unsupported rejection | Enabled-looking `Reject` | Disabled `Reject plan` until a rejection workflow exists |
| Footer control | Enabled-looking `Technical details` | Remove from customer UI or place real diagnostics behind an admin surface |

## Component architecture

```text
app/
├── (auth)/
│   └── welcome/page.tsx
├── (onboarding)/
│   └── setup/
│       ├── layout.tsx
│       ├── account/page.tsx
│       ├── email/page.tsx
│       ├── calendar/page.tsx
│       ├── knowledge/page.tsx
│       └── complete/page.tsx
└── workspace/page.tsx

components/
├── onboarding/
│   ├── OnboardingShell.tsx
│   ├── OnboardingProgress.tsx
│   ├── StepActions.tsx
│   ├── IntegrationCard.tsx
│   ├── PermissionExplanation.tsx
│   ├── ConnectionConfirmation.tsx
│   ├── CalendarSelector.tsx
│   ├── NotionDestinationPicker.tsx
│   ├── SetupSummary.tsx
│   └── GuidedExampleState.tsx
├── workspace/
│   ├── WorkspaceHeader.tsx
│   ├── CaseHero.tsx
│   ├── WorkflowRail.tsx
│   ├── EvidencePanel.tsx
│   ├── ImpactTimeline.tsx
│   ├── PlanPicker.tsx
│   ├── ActionManifest.tsx
│   ├── ApprovalCard.tsx
│   ├── CompletionCard.tsx
│   └── SafetySummary.tsx
└── ui/
    ├── Button.tsx
    ├── StatusBadge.tsx
    ├── InlineAlert.tsx
    ├── ProviderIcon.tsx
    ├── Skeleton.tsx
    └── StepIndicator.tsx

src/
├── onboarding/
│   ├── model.ts
│   ├── state-machine.ts
│   ├── copy.ts
│   └── server-actions.ts
└── integrations/
    ├── gmail.ts
    ├── calendar.ts
    └── notion.ts
```

### Ownership rules

- Route components fetch canonical state and choose the next valid screen.
- `OnboardingShell` owns layout only; it never owns provider state.
- Each integration component receives a normalized connection view model rather than raw provider responses.
- Provider callbacks update server state, then redirect to a stable setup route.
- Shared buttons and alerts centralize loading, disabled, focus, and error semantics.
- Workspace modules consume the existing case/action contracts; onboarding must not redefine them.

## Acceptance criteria before implementation

- All five default screens and their mobile variants are approved from static mockups.
- Gmail, Calendar, and Notion error states are represented in the design package.
- No screen exposes tokens, scopes, endpoints, provider IDs, or state-machine names.
- Back/forward/browser-refresh behavior is defined for every step.
- The connected identity/destination is visible before continuing.
- Setup can resume after a provider redirect or browser close.
- The final empty state teaches the product in under ten seconds.
- The guided example stops before external writes.
- Unsupported controls are absent or visibly disabled—not clickable dead ends.
- No production component is changed until this specification and the static mockups are approved.
