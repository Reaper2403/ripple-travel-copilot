# Hackathon judging scorecard

The official brief requires one useful multi-step agent connected to at least three external apps, a working project/repository, a two-minute demo, and a short system/reliability brief. The published weights are 30% technical execution, 25% reliability and evaluation, 20% usefulness, 15% originality, and 10% demo clarity ([official hackathon page](https://multiappagenthackathon.com/)).

## Traceability

| Criterion | Weight | Build evidence | Demo evidence | Release gate |
|---|---:|---|---|---|
| Technical execution | 30% | Versioned state machine; structured extraction; deterministic impact engine; immutable approval; real Gmail/Calendar/Notion adapters; saga/idempotency/reconciliation | One approved workflow updates all three apps; inspect exact receipts | Real golden path plus duplicate replay and stale-state rejection pass |
| Reliability & evaluation | 25% | Ripple Bench; resettable state; fake clock; faults at every saga boundary; final-state and forbidden-effect assertions | Show scorecard, duplicate replay, and one safe partial failure | All hard invariants/security/P0 scenarios; zero forbidden/duplicate effects |
| Usefulness | 20% | Clear target user; disruption blast-radius workflow; stress/time saved; actionable communication | Cancellation affects real-looking commitments; coordinated recovery in under 90 seconds | User can understand and approve without developer knowledge |
| Originality | 15% | Consequence coordination rather than itinerary extraction/booking; approval bound to source state; reliability as product surface | “What else breaks?” impact map and safe refusal are central | No generic scheduler/chatbot framing; no fake booking claims |
| Demo clarity | 10% | One-screen case; seed/reset; concise system brief; truthful labels | Trigger → evidence → impact → plan → approve → effects → proof in ≤2 min | Three consecutive timed rehearsals succeed |

## Two-minute narrative

The authoritative presenter script and UI choreography are maintained in [the two-minute demo plan](10-two-minute-demo.md). The table below is the submission-level summary.

| Time | Show | Say |
|---:|---|---|
| 0:00–0:15 | Cancellation email and case | “A trip change is easy to notice; its downstream blast radius is hard to coordinate.” |
| 0:15–0:35 | Evidence and impact timeline | “Ripple cites what changed and proves why two commitments are now at risk.” |
| 0:35–0:55 | Two plans and exact action preview | “It proposes strategies, not imaginary flight inventory, and shows every intended side effect.” |
| 0:55–1:20 | Approve and execute | “Approval is bound to this exact plan and snapshot. Notion first, Calendar second, email last.” |
| 1:20–1:38 | Open three provider results/receipts | “The state is synchronized, verified, and replay-safe.” |
| 1:38–1:55 | Bench: duplicate + stale/partial failure | “The same input cannot duplicate actions, and changed state invalidates approval.” |
| 1:55–2:00 | Scorecard/close | “Ripple does not just act—it can show why the action was safe.” |

## Submission checklist

- Working repository with setup, limitations, screenshots, and license.
- Three real user-facing integrations across two vendors: Gmail, Google Calendar, and Notion.
- Two-minute video with readable zoom, voiceover, and backup capture.
- Short brief distilled from architecture and testing docs: system boundary, state/approval model, eval design, results, known limitations.
- Benchmark command and committed sanitized fixtures/results.
- No secrets, personal messages, reservation codes, or private calendars in repository/video.
- All claims match observed behavior; synthetic/twin output labeled clearly.

## Judge-question readiness

- **Why is this an agent?** It converts unstructured evidence into a stateful, branching recovery plan, rechecks evolving state, and coordinates constrained actions across apps.
- **Why not a workflow?** Extraction and plan ranking handle variable inputs, while safety-critical math/policy/execution remain deterministic.
- **What if it is wrong?** Evidence/confidence gates, exact preview, stale approval invalidation, allowlists, and safe terminal states prevent unsupported writes.
- **How do you know it works?** Resettable scenarios assert final provider state, traces, and forbidden effects—not just generated text.
- **Why no rebooking?** Search or transaction access was not proven; Ripple solves the valuable coordination problem without pretending an irreversible purchase is safe.
- **What is next?** Add a provider-neutral discovery adapter and validate it in a sandbox before authorizing any transaction capability.

## Anti-goals for scoring

Do not spend demo time on login, framework names, code tours, generic dashboards, or a long feature list. Do not overfit messaging to a sponsor: the published criteria are the guardrail. Reliability should be visible through product behavior and evidence, not name-dropping.
