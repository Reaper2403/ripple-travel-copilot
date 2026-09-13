# Decision log

## ADR-001 — build Ripple, not the meeting scheduler

**Status:** Accepted.  
**Decision:** Scope a travel-disruption consequence-management agent.  
**Why:** Meeting negotiation is crowded; disrupted travel creates a fresher multi-app problem with meaningful asynchronous state, safety, and evaluation challenges.  
**Consequence:** The product must stay anchored to disruption evidence and downstream commitments rather than becoming a generic scheduler.

## ADR-002 — coordinate recovery; do not transact travel in P0

**Status:** Accepted.  
**Decision:** No paid search guarantee, ticket purchase, exchange, cancellation, refund, or hotel rebooking.  
**Why:** No confirmed transaction-capable provider/sandbox or commercial servicing contract exists. A false “rebooked” claim would hurt technical credibility and safety.  
**Consequence:** Plans contain coordination strategies and manual/deep links; a future `TravelDiscoveryPort` cannot execute transactions by default.

## ADR-003 — Gmail + Google Calendar + Notion are the committed apps

**Status:** Accepted.  
**Decision:** Use Notion as the P0 recovery artifact and keep Google Docs as a fallback behind `ArtifactPort`.  
**Why:** The official brief says three external apps rather than three vendors, but a second vendor removes a high-stakes judging ambiguity. A Notion internal connection needs only a static token and one explicitly shared parent page.  
**Consequence:** The demo shows meaningful state/action in Gmail, Google Calendar, and Notion. The Google Docs fallback must satisfy the same artifact contract but is not counted as the primary third integration.

## ADR-004 — modular monolith with durable local state

**Status:** Accepted.  
**Decision:** One application process with modules and SQLite (or equivalent durable store), not microservices.  
**Why:** Module ports give parallel implementation contracts; distributed deployment adds failure modes without judging benefit.  
**Consequence:** Preserve boundaries in code/package structure and contract tests even though deployment is one unit.

## ADR-005 — hybrid intelligence

**Status:** Accepted.  
**Decision:** Model assists extraction and explanation/ranking; deterministic code owns evidence verification, temporal math, policy, state transitions, approval, and writes.  
**Why:** Generative variability is valuable for messy mail and communication, not for authorization or side-effect safety.  
**Consequence:** All model output is schema-validated, evidence-checked, and policy-filtered.

## ADR-006 — plan-bound, stale-invalidating approval

**Status:** Accepted.  
**Decision:** Approval binds actor, case/plan version, canonical plan/action hash, source snapshot, calendar snapshot, expiry, and one-time nonce.  
**Why:** A vague Boolean approval can authorize unseen or outdated actions.  
**Consequence:** Any material edit or source drift returns the case to review.

## ADR-007 — durable saga, irreversible action last

**Status:** Accepted.  
**Decision:** Persist intents; update the Notion artifact; apply Calendar actions; send Gmail last; verify and journal every result.  
**Why:** External apps cannot share a transaction. Ordering reduces irreversible partial damage and enables resumption.  
**Consequence:** Gmail unknown outcomes require reconciliation/manual review, never blind retry.

## ADR-008 — reliability bench is P0 product scope

**Status:** Accepted.  
**Decision:** Ship seeded stateful scenarios, fake clock, provider faults, invariant/final-state assertions, and a visible scorecard with the MVP.  
**Why:** Reliability/evaluation is 25% of judging and the agent takes consequential cross-app actions.  
**Consequence:** UI polish and optional features are cut before the benchmark.

## ADR-009 — web application core; Gmail-native surface later

**Status:** Accepted.  
**Decision:** Build the hackathon interface as a focused web application backed by durable server-side orchestration. Add a Google Workspace/Gmail add-on as the preferred real-world entry point after the event. Do not use a Chrome extension as the system of record; treat conversational assistant and mobile surfaces as secondary clients.  
**Why:** The workflow needs durable background state, exact approval, multi-app receipts, and cross-device access. A Gmail-native action maximizes discoverability, while the web workspace provides enough room for safe review. Chrome extension service workers are intentionally short-lived and browser-specific.  
**Consequence:** Business rules, credentials, cases, approvals, and retries remain in the backend; every surface calls the same versioned commands.

## Open questions to close before implementation

1. Confirm final UI/runtime stack and the exact OAuth callback URL.
2. Define default arrival/transfer buffers and Calendar P0 action allowlist in a policy fixture.
3. Confirm whether live sending is required or draft creation is accepted; keep send last either way.
