# Ripple v2 — final integrated usability review

**Verdict:** **ENGINEERING GO; final live-demo sign-off pending two human-controlled P0-5 checks**  
**Re-evaluated:** 13 September 2026  
**Method:** Latest production source, focused PM closure tests, integration evidence, and `planning/v2/usability-gates.md`. Browser attachment remained unavailable in this PM lane, so human-perception checks are not inferred from source.

## Current acceptance summary

| Gate | Status | Evidence |
|---|---|---|
| P0-1 · No legacy/dead-control path | **Closed** | V2 contains no `/case/demo` or `Review disruption` route/control; recent-change review remains inside Screen 5. |
| P0-2 · Useful Notion tracker | **Closed** | Adapter and preview contain the complete executive structure; conformance verifies content, safe metadata, repair, and preservation. |
| P0-3 · Calendar proof link | **Closed** | Verified Google Calendar URL flows through adapter, receipt service, validation, and UI; unsafe/lookalike URLs are rejected. |
| P0-4 · Desktop Back on Screen 5 | **Closed** | Completion renders the desktop in-card Back route to Notion; the mobile shell alternative remains available below 600 px. |
| P0-5A · Automated fixture rehearsals | **Closed** | Three consecutive deterministic service rehearsals passed in 848 ms, 868 ms, and 863 ms. |
| P0-5B · Human accessibility/visual rehearsal | **Open — human check** | Keyboard focus order, screen-reader announcements, 125% zoom, and projector layout need direct observation. |
| P0-5C · Real write and reset | **Open — user confirmation required** | A real Calendar hold and Notion page have not been created by the tester; external writes require explicit in-product user confirmation. |

Latest engineering gate: **100/100 tests**, TypeScript, production build, and diff checks pass.

## Closed implementation blockers

### P0-1 — Legacy surface isolation: closed

The v2 workspace no longer links to the legacy `/case/demo` surface. Its header contains only the Ripple home link and a non-interactive identity indicator. Schedule options remain in the v2 workspace and always use a real refine action.

This removes the user-accessible path to the old `Gmail source` shell, disabled Edit/Reject/Technical controls, and developer-facing case language. The legacy component may remain for v1 compatibility, but it is not part of the v2 customer journey.

Acceptance evidence:

- source assertion rejects `/case/demo` and `Review disruption` in the v2 workspace;
- Screen 5 starters and proposal actions remain functional;
- no v2 dead-control regression was introduced.

### P0-2 — Notion executive utility: closed

The real tracker now creates:

- `At a glance` with status, chosen decision, impact, next deadline, and last updated;
- `What changed`;
- `Affected commitments` with time, owner, impact, and chosen response;
- `Next actions` with owner, due date/timezone, and task state;
- `Decision log`, including the explicit manual boundary.

Stable tracker/task identifiers are stored as zero-width metadata links rather than visible technical copy. Creation and reconciliation verify required headings and tasks, preserve human content and existing checkbox state, repair missing Ripple-owned content, and avoid duplicate tasks/pages.

The exact confirmation UI previews the same executive fields before the write. This is now a follow-through workspace rather than a ledger.

### P0-3 — Calendar proof link: closed

The Google Calendar adapter returns the provider event's verified `htmlLink` only when it is an HTTPS Google Calendar destination. The public execution service validates the provider URL again, and the UI displays **Open in Calendar** only for a verified receipt.

Focused tests prove:

- a verified Calendar link reaches the result view;
- an unverified receipt cannot produce the link;
- a lookalike or unsafe hostname is rejected;
- Notion and Calendar proof links remain distinct.

### P0-4 — Screen 5 desktop Back: closed

The completion screen now renders its normal in-card Back control at desktop widths and maps it to `/setup/knowledge`. Below 600 px, that control is hidden and the shell's mobile Back alternative is displayed. Verified setup state is preserved because navigation does not disconnect providers.

Focused source/CSS tests cover both variants.

## P0-5 — Final demo evidence, split by authority

### P0-5A — Automated three-run fixture rehearsal: closed

Three consecutive deterministic rehearsals completed successfully in **848 ms**, **868 ms**, and **863 ms**. Each covered the proposal, exact confirmation, execution, and safe-provider path. The complete engineering suite now passes 100/100.

This proves repeatability and safety, but the sub-second service timing must not be presented as a timed human demo rehearsal.

### P0-5B — Human-only accessibility and visual checks: open

Static/automated evidence already confirms:

- native keyboard controls and labelled confirmation region;
- focus-visible styles;
- reduced-motion handling;
- responsive reflow contracts and a prior 390 px no-overflow walkthrough.

A human must still observe and record:

1. keyboard focus order through onboarding, composer, options, refinement, rejection, confirmation, and result links;
2. focus placement after route changes and errors;
3. screen-reader announcements for checking, connected, error, proposal, execution, and completion states;
4. no clipping or hidden action at 125% zoom;
5. legibility and action visibility at the actual projector resolution;
6. three presenter-operated runs completing within two minutes from reset.

This cannot be truthfully signed off from DOM/CSS inspection alone.

### P0-5C — User-confirmed real write/reset: open

Real Gmail, Calendar, and Notion connection verification has passed without exposing identities. The tester intentionally did not perform provider mutations.

The user must initiate the exact in-product confirmation for one controlled golden path. The acceptance witness should verify:

1. the preview shows the precise Calendar hold and complete Notion tracker;
2. one confirmation creates exactly one Ripple-owned Calendar hold and one Notion page;
3. both **Open in Calendar** and **Open in Notion** reach the exact created artifacts;
4. the Notion page contains all five required sections and useful owner/deadline content;
5. replay creates no duplicate artifact;
6. reset removes only Ripple-marked fixtures and restores the original Calendar baseline.

This remains a P0 live-demo gate because external writes and deletion/reset require the user's explicit action-time confirmation.

## P1 follow-ups — not release blockers

- Show the configured masked operator identity on Screen 1 to make the single-operator model even clearer.
- Rename terminal **Not now** to **Set this plan aside**, or implement genuine postponement.
- Restore the latest conversation/result after hard refresh for stronger continuity.
- Add more granular assistant progress copy when schedule analysis is slow.
- Add a direct connection-recovery destination from the workspace when a provider needs attention.
- Add the framework smooth-scroll document hint if a warning-free development console is desired.

## Final sign-off condition

No additional production feature work is required for P0-1 through P0-4. Ripple v2 is approved for the final human acceptance session.

Full demo sign-off is granted after P0-5B and P0-5C are witnessed and recorded: the accessibility/zoom/projector/timed human rehearsal, followed by the user-confirmed real Calendar + Notion write and safe reset.
