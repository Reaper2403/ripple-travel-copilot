"use client";

import { useEffect, useState } from "react";

export type ExactActionVM =
  | { id: string; provider: "notion"; title: string; destination: string; executiveSummary: string; trackerStatus?: string; chosenDecision?: string; impact?: string; nextDeadline?: string; affectedCommitments?: Array<{ title: string; time: string; owner: string; impact: string; response: string }>; decisions?: Array<{ decision: string; decidedAt: string }>; tasks: Array<{ id: string; title: string; owner: string; due: string; status: string }> }
  | { id: string; provider: "calendar"; title: string; calendar: string; start: string; end: string; timezone: string; visibility?: string; attendees: string[]; change?: string }
  | { id: string; provider: "gmail"; title: string; recipients: string[]; cc: string[]; bcc: string[]; subject: string; body: string };

export interface ExactManifestVM {
  proposalId: string;
  version: number;
  proposalHash: string;
  manifestHash: string;
  expiresAt: string;
  actions: ExactActionVM[];
  assumptions: string[];
}

export function ActionConfirmationCard({ manifest, state, onConfirm, onReject, onRefine }: {
  manifest: ExactManifestVM;
  state: "ready" | "approved" | "confirming" | "executing" | "stale" | "rejected";
  onConfirm(): void;
  onReject(): void;
  onRefine(): void;
}) {
  const [expired, setExpired] = useState(() => Date.parse(manifest.expiresAt) <= Date.now());
  useEffect(() => {
    const remaining = Date.parse(manifest.expiresAt) - Date.now();
    if (remaining <= 0) { setExpired(true); return; }
    setExpired(false);
    const timer = window.setTimeout(() => setExpired(true), remaining);
    return () => window.clearTimeout(timer);
  }, [manifest.expiresAt]);
  const effectiveState = expired && state === "ready" ? "stale" : state;
  const disabled = effectiveState !== "ready" && effectiveState !== "approved";
  return (
    <section className="v2-confirmation-card" aria-labelledby="confirmation-title">
      <header><div><p className="v2-eyebrow">Your confirmation</p><h3 id="confirmation-title">Review every update before Ripple acts.</h3></div><span>{manifest.actions.length} exact update{manifest.actions.length === 1 ? "" : "s"}</span></header>
      <p className="v2-confirmation-intro">These details come from the saved plan. Nothing in this card can be changed at confirmation time. Review by {new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(manifest.expiresAt))}.</p>
      <div className="v2-exact-actions">{manifest.actions.map((action, index) => <ExactAction key={action.id} action={action} index={index + 1} />)}</div>
      {manifest.assumptions.length ? <details className="v2-assumptions"><summary>Assumptions Ripple used</summary><ul>{manifest.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></details> : null}
      {effectiveState === "stale" ? <div className="v2-inline-alert" role="alert"><strong>This preview is no longer current.</strong><span>Refine the request to prepare fresh options. No changes were made.</span></div> : null}
      {effectiveState === "rejected" ? <div className="v2-calm-state" role="status"><strong>Plan set aside</strong><span>No connected apps were changed.</span></div> : null}
      {effectiveState !== "rejected" ? <footer className="v2-confirm-actions"><button type="button" className="v2-confirm-button" disabled={disabled} onClick={onConfirm}>{effectiveState === "confirming" ? "Confirming your plan…" : effectiveState === "executing" ? "Making approved updates…" : effectiveState === "approved" ? "Make the approved updates" : `Confirm and make ${manifest.actions.length} update${manifest.actions.length === 1 ? "" : "s"}`}<span>→</span></button><div><button type="button" disabled={effectiveState === "confirming" || effectiveState === "executing" || effectiveState === "approved"} onClick={onRefine}>Refine plan</button><button type="button" disabled={effectiveState === "confirming" || effectiveState === "executing" || effectiveState === "approved"} onClick={onReject}>Not now</button></div></footer> : null}
      <p className="v2-confirmation-boundary">Typing “yes” or selecting an option cannot approve these changes.</p>
    </section>
  );
}

function ExactAction({ action, index }: { action: ExactActionVM; index: number }) {
  return <article className={`v2-exact-action is-${action.provider}`}>
    <div className="v2-exact-action-head"><span>{index}</span><div><small>{action.provider === "notion" ? "Notion follow-through" : action.provider === "calendar" ? "Calendar" : "Gmail"}</small><strong>{action.title}</strong></div></div>
    {action.provider === "notion" ? <div className="v2-tracker-preview"><p><span>Destination</span><strong>{action.destination}</strong></p><p>{action.executiveSummary}</p>{action.trackerStatus || action.chosenDecision || action.impact || action.nextDeadline ? <dl className="v2-tracker-glance">{action.trackerStatus ? <div><dt>Status</dt><dd>{action.trackerStatus}</dd></div> : null}{action.chosenDecision ? <div><dt>Decision</dt><dd>{action.chosenDecision}</dd></div> : null}{action.impact ? <div><dt>Impact</dt><dd>{action.impact}</dd></div> : null}{action.nextDeadline ? <div><dt>Next deadline</dt><dd>{action.nextDeadline}</dd></div> : null}</dl> : null}{action.affectedCommitments?.length ? <><h4>Affected commitments</h4><ul className="v2-commitment-preview">{action.affectedCommitments.map((item) => <li key={`${item.title}-${item.time}`}><span><strong>{item.title}</strong><small>{item.time} · {item.owner}</small><small>{item.impact} · {item.response}</small></span></li>)}</ul></> : null}<h4>Next actions</h4><ul>{action.tasks.map((task) => <li key={task.id}><span className="v2-task-box" aria-hidden="true" /><span><strong>{task.title}</strong><small>{task.owner} · {task.due} · {task.status}</small></span></li>)}</ul>{action.decisions?.length ? <><h4>Decision log</h4><ul className="v2-decision-log">{action.decisions.map((item) => <li key={`${item.decision}-${item.decidedAt}`}><span><strong>{item.decision}</strong><small>{item.decidedAt}</small></span></li>)}</ul></> : null}</div> : null}
    {action.provider === "calendar" ? <dl className="v2-action-fields">{action.change ? <div><dt>Change</dt><dd>{action.change}</dd></div> : null}<div><dt>When</dt><dd>{action.start}–{action.end} {action.timezone}</dd></div><div><dt>Calendar</dt><dd>{action.calendar}</dd></div>{action.visibility ? <div><dt>Visibility</dt><dd>{action.visibility}</dd></div> : null}<div><dt>Attendees</dt><dd>{action.attendees.length ? action.attendees.join(", ") : "No invitations"}</dd></div></dl> : null}
    {action.provider === "gmail" ? <div className="v2-message-preview"><dl className="v2-action-fields"><div><dt>To</dt><dd>{action.recipients.join(", ")}</dd></div><div><dt>CC / BCC</dt><dd>{action.cc.join(", ") || "None"} / {action.bcc.join(", ") || "None"}</dd></div><div><dt>Subject</dt><dd>{action.subject}</dd></div></dl><p>{action.body}</p></div> : null}
  </article>;
}

export interface ReceiptVM { id: string; provider: "notion" | "calendar" | "gmail"; label: string; status: "waiting" | "running" | "verified" | "failed" | "unknown"; detail: string; link?: string }

export function ExecutionResult({ receipts, status, replay, onReplay, onContinue }: { receipts: ReceiptVM[]; status: "executing" | "complete" | "partial" | "manual"; replay?: { newActions: number; reusedActions: number }; onReplay?(): void; onContinue?(): void }) {
  const title = status === "complete" ? "All approved updates are complete." : status === "executing" ? "Making your approved updates…" : status === "manual" ? "One result needs your attention." : "Some updates need attention.";
  return <section className={`v2-execution-card is-${status}`} aria-live="polite"><header><span aria-hidden="true">{status === "complete" ? "✓" : status === "executing" ? "↻" : "!"}</span><div><p className="v2-eyebrow">{status === "complete" ? "Confirmed" : "Update status"}</p><h3>{title}</h3></div></header>{receipts.length ? <ul>{receipts.map((receipt) => <li key={receipt.id}><span className={`v2-receipt-state is-${receipt.status}`}>{receipt.status === "verified" ? "✓" : receipt.status === "running" ? "↻" : receipt.status === "waiting" ? "·" : "!"}</span><div><small>{receipt.provider}</small><strong>{receipt.label}</strong><p>{receipt.detail}</p></div>{receipt.link && receipt.status === "verified" ? <a href={receipt.link} target="_blank" rel="noopener noreferrer">Open in {receipt.provider === "notion" ? "Notion" : receipt.provider === "calendar" ? "Calendar" : "Gmail"} ↗</a> : null}</li>)}</ul> : <p className="v2-result-note">{status === "complete" ? "Ripple has a completed server record. Open the connected apps to review it." : "Detailed results are unavailable in this view. Check the connected apps before trying again."}</p>}{onContinue ? <button className="v2-continue-execution" type="button" onClick={onContinue}>Make the approved updates <span>→</span></button> : null}{status === "complete" && onReplay ? <button className="v2-replay-button" type="button" onClick={onReplay}>Check for duplicate updates</button> : null}{replay ? <div className="v2-replay-proof"><strong>{replay.newActions === 0 ? "No duplicate updates created" : `${replay.newActions} new updates detected`}</strong><span>{replay.reusedActions} existing update{replay.reusedActions === 1 ? " was" : "s were"} safely reused.</span></div> : null}</section>;
}
