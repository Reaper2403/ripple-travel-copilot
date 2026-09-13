"use client";

import { useEffect, useState } from "react";
import { ArrowIcon, CalendarIcon, CheckIcon, ChevronIcon, MailIcon, PageIcon, ReplayIcon, ShieldIcon } from "./icons";
import { approveRippleCase, demoCase, getRippleCase, replayRippleCase, type ActionStatus, type BenchResult, type RippleAction, type RippleCase } from "./ripple-client";

const actionIcons = { Notion: PageIcon, "Google Calendar": CalendarIcon, Gmail: MailIcon };

function ProviderIcon({ provider }: { provider: RippleAction["provider"] }) {
  const Icon = actionIcons[provider];
  return <span className={`provider-icon provider-${provider.toLowerCase().replace("google ", "")}`}><Icon /></span>;
}

function StatusMark({ status }: { status: ActionStatus }) {
  if (status === "verified") return <span className="status-mark verified"><CheckIcon /> Verified</span>;
  if (status === "running") return <span className="status-mark running"><span className="spinner" /> Verifying</span>;
  if (status === "failed") return <span className="status-mark failed">Failed safely</span>;
  if (status === "unknown") return <span className="status-mark warning">Check manually</span>;
  return <span className="status-mark planned">Planned</span>;
}

export function RippleWorkspace() {
  const [caseData, setCaseData] = useState<RippleCase>(demoCase);
  const [selectedPlan, setSelectedPlan] = useState("remote-first");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requestPending, setRequestPending] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [bench, setBench] = useState<BenchResult | null>(null);
  const [expandedAction, setExpandedAction] = useState<string | null>("mail-1");
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [replayResult, setReplayResult] = useState<number | null | "unverified">(null);
  const [showSafety, setShowSafety] = useState(false);

  useEffect(() => {
    getRippleCase().then((payload) => {
      setCaseData(payload.case);
      setSelectedPlan(payload.case.plans.find((plan) => plan.recommended)?.id ?? payload.case.plans[0]?.id ?? "");
      setExpandedAction(payload.case.actions.at(-1)?.id ?? null);
      setBench(payload.bench);
      setConnected(payload.connected);
      setLoading(false);
    });
  }, []);

  const displayedPlan = caseData.plans.find((plan) => plan.id === selectedPlan) ?? caseData.plans[0];
  const actions = displayedPlan?.actions ?? (selectedPlan === caseData.plans.find((plan) => plan.recommended)?.id ? caseData.actions : caseData.actions.slice(0, displayedPlan?.actionCount ?? caseData.actions.length));
  const actionCounts = {
    notion: actions.filter((action) => action.provider === "Notion").length,
    calendar: actions.filter((action) => action.provider === "Google Calendar").length,
    gmail: actions.filter((action) => action.provider === "Gmail").length,
  };
  const verifiedCount = actions.filter((action) => action.status === "verified").length;
  const runState = caseData.status === "Recovered" ? "complete" : caseData.status === "Executing" || requestPending ? "executing" : caseData.canApprove ? "review" : "blocked";

  async function approve() {
    if (runState !== "review" || !connected) return;
    setRequestPending(true);
    setRequestError(null);
    setReplayResult(null);
    try {
      const updated = await approveRippleCase(caseData.caseId, selectedPlan, caseData.caseVersion);
      setCaseData(updated);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Approval failed safely. No further actions were attempted.");
    } finally {
      setRequestPending(false);
    }
  }

  async function replay() {
    if (!connected || requestPending) return;
    setRequestPending(true);
    setRequestError(null);
    setReplayResult(null);
    try {
      const result = await replayRippleCase(caseData.caseId);
      setCaseData(result.case);
      setReplayResult(result.newActions ?? "unverified");
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Replay could not be verified.");
    } finally {
      setRequestPending(false);
    }
  }

  return (
    <main className="app-frame">
      <header className="topbar">
        <div className="wordmark" aria-label="Ripple">
          <span className="brand-mark">R</span>
          <span>Ripple</span>
        </div>
        <div className="topbar-meta">
          <span className="mode-pill"><span /> {loading ? "Connecting" : caseData.mode}</span>
          <span className={`case-status status-${runState}`}>{requestPending ? "Executing" : caseData.status}</span>
          <span className="avatar" aria-label="Signed-in demo operator">AC</span>
        </div>
      </header>

      <div className="workspace" id="top">
        {!connected && !loading && <div className="fixture-banner" role="status"><strong>Design fixture</strong><span>The case service is unavailable, so actions are disabled. No provider results are being claimed.</span></div>}
        {requestError && <div className="request-error" role="alert"><strong>Ripple stopped safely.</strong><span>{requestError}</span><button onClick={() => setRequestError(null)}>Dismiss</button></div>}
        <section className="case-intro" aria-labelledby="case-title">
          <div>
            <div className="case-kicker"><span>Case {caseData.caseId}</span><span>v{caseData.caseVersion}</span><span>{caseData.lastChecked}</span></div>
            <h1 id="case-title">{caseData.headline}</h1>
            <p>{caseData.subhead}</p>
          </div>
          {runState === "complete" && <div className="final-counter"><strong>{verifiedCount}</strong><span>verified effects</span></div>}
        </section>

        <ol className="story-rail" aria-label="Ripple workflow across connected applications">
          <li className={`rail-item ${caseData.sourceChecked ? "active" : ""}`}><ProviderIcon provider="Gmail"/><span><small>Source</small>{caseData.sourceChecked ? "Gmail notice" : "Source unavailable"}</span>{caseData.sourceChecked && <CheckIcon className="rail-check" />}</li>
          <li className="rail-arrow"><ArrowIcon /></li>
          <li className={`rail-item ${caseData.calendarChecked ? "active" : ""}`}><ProviderIcon provider="Google Calendar"/><span><small>Impact</small>{caseData.calendarChecked ? "Calendar checked" : "Calendar incomplete"}</span>{caseData.calendarChecked && <CheckIcon className="rail-check" />}</li>
          <li className="rail-arrow"><ArrowIcon /></li>
          <li className={`rail-item ${actions.find((action) => action.provider === "Notion")?.status === "verified" ? "active" : ""}`}><ProviderIcon provider="Notion"/><span><small>Recovery</small>{actions.find((action) => action.provider === "Notion")?.status === "verified" ? "Brief verified" : "Ready to create"}</span>{actions.find((action) => action.provider === "Notion")?.status === "verified" && <CheckIcon className="rail-check" />}</li>
        </ol>

        <section className="context-grid">
          <article className="content-section changed-section">
            <div className="section-heading"><div><span className="section-number">01</span><h2>What changed</h2></div><span className="source-link shell-control" aria-label="Gmail source integration reserved for a future release">Gmail source</span></div>
            <div className="flight-row">
              <div className="flight-route"><span className="airport">{caseData.route.origin}</span><span className="route-line"><i /><span>{caseData.route.serviceNumber}</span><i /></span><span className="airport">{caseData.route.destination}</span></div>
              <div className="fact-change"><span className="old-value">{caseData.evidence.previous}</span><ArrowIcon/><strong>{caseData.evidence.value}</strong></div>
            </div>
            <button className="evidence-toggle" onClick={() => setEvidenceOpen(!evidenceOpen)} aria-expanded={evidenceOpen} id="evidence">
              <span className="evidence-status"><CheckIcon /> Verified from email</span>
              <span>Show evidence <ChevronIcon className={evidenceOpen ? "chevron-open" : ""}/></span>
            </button>
            {evidenceOpen && <blockquote className="evidence-quote"><mark>“{caseData.evidence.excerpt}”</mark><footer>{caseData.evidence.timestamp}</footer></blockquote>}
          </article>

          <article className="content-section impact-section">
            <div className="section-heading"><div><span className="section-number">02</span><h2>Blast radius</h2></div><span className="impact-summary">{caseData.impacts.length} affected</span></div>
            <div className="timeline">
              {caseData.impacts.map((impact) => <div className={`timeline-item tone-${impact.tone}`} key={impact.title}>
                <div className="timeline-time"><strong>{impact.time}</strong><span>{impact.timezone}</span></div>
                <div className="timeline-dot" />
                <div className="timeline-content"><div><h3>{impact.title}</h3><span className={`risk-label ${impact.tone}`}>{impact.verdict}</span></div><p>{impact.reason}</p><small>{impact.owner}</small></div>
              </div>)}
            </div>
          </article>
        </section>

        <section className="plans-section" aria-labelledby="plans-title">
          <div className="section-heading"><div><span className="section-number">03</span><h2 id="plans-title">Choose a response</h2></div><span className="calm-label">{caseData.plans.length} feasible plans</span></div>
          <div className="plan-grid">
            {caseData.plans.map((plan) => <button key={plan.id} className={`plan-card ${selectedPlan === plan.id ? "selected" : ""}`} onClick={() => setSelectedPlan(plan.id)} aria-pressed={selectedPlan === plan.id} disabled={runState !== "review"}>
              <div className="plan-card-title"><span className="radio-dot"/><h3>{plan.name}</h3>{plan.recommended && <span className="recommended">Recommended</span>}</div>
              <p>{plan.rationale}</p>
              <dl><div><dt>Resolves</dt><dd>{plan.resolves}</dd></div><div><dt>Leaves manual</dt><dd>{plan.leaves}</dd></div><div><dt>Actions</dt><dd>{plan.actionCount} exact effects</dd></div></dl>
            </button>)}
          </div>
        </section>

        <section className="action-zone" aria-labelledby="actions-title">
          <div className="action-preview">
            <div className="section-heading"><div><span className="section-number">04</span><h2 id="actions-title">Exact actions</h2></div><div className="action-counts"><span>Notion {actionCounts.notion}</span><i/> <span>Calendar {actionCounts.calendar}</span><i/> <span>Gmail {actionCounts.gmail}</span></div></div>
            <div className="manifest-list">
              {actions.map((action, index) => <div className={`manifest-row ${expandedAction === action.id ? "expanded" : ""}`} key={action.id}>
                <button className="manifest-main" onClick={() => setExpandedAction(expandedAction === action.id ? null : action.id)} aria-expanded={expandedAction === action.id}>
                  <span className="action-index">{index + 1}</span><ProviderIcon provider={action.provider}/><span className="manifest-copy"><small>{action.shortProvider}</small><strong>{action.title}</strong><span>{action.detail}</span></span><StatusMark status={action.status}/><ChevronIcon className={expandedAction === action.id ? "chevron-open" : ""}/>
                </button>
                {expandedAction === action.id && <div className="action-detail"><ul>{action.preview.map((item) => <li key={item}>{item}</li>)}</ul>{action.receipt && <span className="receipt-label"><CheckIcon/> Receipt recorded</span>}</div>}
              </div>)}
            </div>
          </div>

          <aside className="approval-panel">
            {runState === "review" && <>
              <ShieldIcon className="approval-shield"/>
              <p className="eyebrow">Approval boundary</p>
              <h2>Nothing changes until you approve.</h2>
              <p className="approval-copy">Approve {actions.length} actions. Nothing else is authorized. Locked to this plan and current calendar snapshot.</p>
              <div className="expiry"><span>Approval window</span><strong>Starts when approved</strong></div>
              <button className="primary-button approve-button" onClick={approve} disabled={!connected || !caseData.canApprove}>{!connected ? "Actions unavailable in fixture" : caseData.canApprove ? `Approve these ${actions.length} actions` : "Review required before approval"} <ArrowIcon/></button>
              <div className="secondary-actions"><button disabled title="Editing is outside the hackathon scope">Edit plan</button><button disabled title="Rejection workflow is outside the hackathon scope">Reject plan</button></div>
            </>}
            {runState === "executing" && <div className="execution-state" aria-live="polite"><span className="large-spinner"/><p className="eyebrow">Executing safely</p><h2>{actions.find((a) => a.status === "running")?.title ?? "Waiting for provider receipts"}</h2><p>Notion first, Calendar second, Gmail last.</p></div>}
            {runState === "blocked" && <div className="blocked-state" role="status"><ShieldIcon className="approval-shield"/><p className="eyebrow">Action paused</p><h2>{caseData.status}</h2><p className="approval-copy">Ripple needs confirmed evidence or provider recovery before it can issue an approval. No external writes are available.</p></div>}
            {runState === "complete" && <div className="completion-state" aria-live="polite"><span className="completion-check"><CheckIcon/></span><p className="eyebrow">Recovery complete</p><h2>{actions.filter((action) => action.status === "verified").length} of {actions.length} actions verified.</h2><p>Verified states below come directly from provider receipts.</p><button className="outline-button" onClick={replay} disabled={requestPending}><ReplayIcon/> {requestPending ? "Checking replay…" : "Replay same notice"}</button>{replayResult !== null && <div className="replay-result">{replayResult === "unverified" ? <span><strong>Replay result unavailable</strong>The server returned no provider-effect count.</span> : <><CheckIcon/><span><strong>{replayResult} new actions</strong>{replayResult === 0 ? "Duplicate safely ignored" : "Review new provider effects"}</span></>}</div>}</div>}
          </aside>
        </section>

        <section className="safety-section" id="receipt-proof">
          <button className="safety-summary" onClick={() => setShowSafety(!showSafety)} aria-expanded={showSafety}>
            <span className="safety-score"><ShieldIcon/><strong>{bench ? `${bench.passed}/${bench.total}` : "Not run"}</strong><span>Safety scenarios {bench ? "passed" : "available after benchmark"}</span></span>
            <span className="safety-invariants"><span>Receipt-backed outcomes</span><span>Exact approval boundary</span><span>Ordered side effects</span></span>
            <ChevronIcon className={showSafety ? "chevron-open" : ""}/>
          </button>
          {showSafety && <div className="safety-details">{bench ? bench.scenarios.slice(0, 3).map((scenario) => <div key={scenario.id} className={scenario.passed ? "" : "scenario-failed"}><CheckIcon/><span><strong>{scenario.name}</strong>{scenario.passed ? "Passed" : "Needs attention"}</span></div>) : <p className="bench-empty">Run the server reliability benchmark to show scenario evidence here.</p>}<small>Counts are loaded from the current server benchmark.</small></div>}
        </section>
      </div>
      <footer className="app-footer"><span>Ripple only acts on the exact plan you approve.</span><button disabled title="Technical operations remain intentionally hidden in the demo UI">Technical details</button></footer>
    </main>
  );
}
