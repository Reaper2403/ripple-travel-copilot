# Product scope

## Product definition

**Name:** Ripple — Travel Disruption Copilot  
**Promise:** “When travel changes, understand what else breaks and recover safely.”  
**Primary user:** a knowledge worker travelling for meetings who has Gmail and Google Calendar and wants a concise, controlled response to a delay or cancellation.  
**Trigger:** an email explicitly selected or labeled for Ripple in the MVP. Automatic mailbox monitoring is post-hackathon.

Ripple is not a generic trip planner. It is a consequence-management agent: it converts an authoritative disruption notice into an evidence-backed impact graph and an approval-gated set of actions across the user’s working tools.

## Jobs to be done

1. **Understand:** “Tell me what changed, using evidence rather than guesses.”
2. **Assess:** “Show which commitments are now impossible or risky, including time zones and buffers.”
3. **Decide:** “Give me a small number of feasible recovery plans and explain the trade-offs.”
4. **Control:** “Show exactly what will happen and ask once before acting.”
5. **Recover:** “Update the shared source of truth and notify only the right people, exactly once.”
6. **Trust:** “Let me verify what happened and understand any partial failure.”

## Golden-path journey

1. User labels a real or synthetic disruption email `RIPPLE/READY` and starts a run.
2. Ripple parses carrier, reservation reference (masked in UI/logs), affected segment, old/new timing, status, and source excerpts.
3. A confidence/evidence gate either continues or asks the user to correct missing critical facts.
4. Ripple reads a bounded Calendar window around the trip, applies configurable transfer and preparation buffers, and classifies events as impossible, at risk, or unaffected.
5. Ripple produces two or three ranked plans. Each has rationale, assumptions, predicted outcome, and an exact action manifest.
6. The user can exclude actions or edit draft text; any material edit creates a new plan version.
7. Approval binds the user, plan version, action manifest hash, and source snapshot hash.
8. Execution creates/updates the recovery page in Notion first, applies Calendar mutations second, and sends Gmail messages last.
9. Ripple verifies provider state and renders receipts, retry controls, and any remaining manual action.

## Feature backlog

### P0 — submission-critical

| Capability | Feature | Acceptance condition |
|---|---|---|
| Controlled intake | Process only explicitly labeled/selected Gmail messages | Unlabeled email can never start a write-capable run |
| Evidence extraction | Structured disruption facts with source message ID, excerpt, and confidence per critical field | Missing/contradictory critical fields stop before planning |
| Calendar impact | Bounded event lookup, timezone normalization, travel/buffer feasibility check | Every “at risk” result exposes the rule and times used |
| Recovery planning | Rank 2–3 plans without claiming live availability or price | Plans distinguish verified facts, assumptions, and manual booking links |
| Side-effect preview | Human-readable diff plus canonical action manifest | Preview and executable manifest share the same hash |
| Approval gate | Approve/reject exact immutable plan; expiration and stale-snapshot invalidation | Execution refuses an absent, expired, reused, or mismatched approval |
| Safe execution | Notion → Calendar → Gmail saga, idempotency key per action, bounded retry | Replay produces no duplicate page, event, or email |
| Receipts | Provider IDs, before/after summary, status, attempts, timestamps | Every action ends verified, failed, skipped, or manual-review |
| Reliability bench | Seeded scenarios, fault injection, forbidden-effects assertions, scorecard | Release gates in testing plan pass |
| Demo reset | Known Gmail label, demo calendar, deterministic fixtures, cleanup instructions | Golden path can be rerun in under five minutes |

### P1 — strong if time remains

- User edits a plan while preserving a new version and audit trail.
- Cancellation/reschedule drafts for multiple stakeholder groups.
- Calendar write modes: add travel-status note, tentative hold, or move an owned event.
- Google Doc template with timeline, decisions, owner checklist, links, and receipts.
- Recovery after partial provider failure, with “retry remaining” and no replay of completed actions.
- Optional Google Docs `ArtifactPort` fallback, with identical semantic output.
- Arga sandbox/twin configuration if participant access supports the required services.

### P2 — post-hackathon

- Gmail push notifications and continuous monitoring.
- Live flight-status provider for proactive detection.
- Travel inventory/search and transaction adapters.
- Multi-user SaaS OAuth, workspace policies, delegation, and admin controls.
- Organization travel policy ingestion, expense tooling, and traveller profiles.
- Mobile/push notification channel and shared/team incident response.

## Explicit non-goals

- Purchasing, cancelling, or rebooking a paid itinerary.
- Claiming a suggested flight has live availability, a guaranteed fare, or policy approval.
- Automatically moving/cancelling a meeting or sending email without approval.
- Scraping airline websites or asking users for airline passwords.
- Reading the whole mailbox or an unbounded calendar history.
- Solving leisure itinerary creation, visas, insurance claims, or expense reimbursement.
- Multi-tenant production hardening during the hackathon.

## Product rules

- **Evidence over fluency:** critical facts require a provider source; low confidence cannot be hidden by polished prose.
- **Plans are proposals:** unverified alternatives are labeled assumptions and link to manual booking.
- **One approval, one immutable manifest:** no action may be added after approval.
- **Irreversible action last:** outbound communication follows reversible/documentary updates.
- **Fail closed:** ambiguity, stale state, scope mismatch, or lost authentication prevents writes.
- **Least impact:** no broad cancellations; default Calendar write is a note/hold unless ownership and explicit action are clear.

## Success metrics

| Dimension | P0 target |
|---|---|
| Critical-field extraction | ≥ 95% exact match on benchmark; 100% of unsupported critical facts blocked/correctable |
| Impact classification | ≥ 90% scenario-level F1; 100% timezone/DST fixtures pass |
| Idempotency | 0 duplicate external side effects over all replay tests |
| Safety | 0 unapproved, stale-approved, or out-of-manifest writes |
| Recovery | 100% injected partial failures surface an actionable terminal state |
| Usability | Golden path from trigger to approval in ≤ 90 seconds during demo rehearsal |
| Demo clarity | A viewer can state trigger, decision, safeguards, and proof within two minutes |

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Travel email formats vary | Seeded fixtures, schema validation, evidence spans, correction gate |
| “Three apps” reads as a same-vendor technicality | Use Notion as the P0 artifact target, making the golden path Gmail + Calendar + Notion across two vendors |
| Gmail scopes delay public verification | Keep OAuth app in Testing with named test users for the hackathon; document production verification |
| Agent fabricates alternatives | No live inventory claims; represent alternatives as strategies/manual links, not bookable offers |
| Side effects drift after preview | Snapshot hashes, plan version, TTL, just-in-time revalidation |
| Two-minute demo overruns | One golden path, one compact reliability scorecard, preseeded accounts |
