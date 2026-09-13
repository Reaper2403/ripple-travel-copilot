"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, forwardRef, useEffect, useRef, useState } from "react";
import { ActionConfirmationCard, ExecutionResult, type ReceiptVM } from "./action-confirmation-card";
import { askAssistant, confirmProposalGate, mapConversationReply, onboardingApi, proposalApi } from "./client";
import { connectionStatusLabel, isConnectionCurrent, providerLabels, stepPath } from "./copy";
import { ProviderMark } from "./provider-mark";
import { insightKey } from "./proposal-view";
import { exactManifestView, executionPresentationState, receiptViews, waitingReceipts } from "./proposal-view";
import type { AssistantIntent, AssistantReply, ConversationView, OnboardingProfile, ScheduleOption } from "./types";

const suggestions: Array<{ title: string; copy: string; prompt: string; intent: AssistantIntent }> = [
  { title: "Prepare my week", copy: "Find tight transitions, missing prep time, and avoidable conflicts.", prompt: "Prepare my week and show me the pressure points.", intent: "prepare_week" },
  { title: "Review recent changes", copy: "Check relevant travel notices against upcoming commitments.", prompt: "Review recent travel changes against my schedule.", intent: "review_changes" },
  { title: "Show how approval works", copy: "See the safety boundary without changing anything.", prompt: "Show me how approval works.", intent: "approval_demo" },
];

function inferIntent(message: string): AssistantIntent {
  const value = message.toLowerCase();
  if (value.includes("approval")) return "approval_demo";
  if (value.includes("change") || value.includes("flight") || value.includes("travel")) return "review_changes";
  if (value.includes("find") && value.includes("time")) return "find_time";
  if (value.includes("week") || value.includes("prepare")) return "prepare_week";
  return "custom";
}

export function AssistantWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [conversationView, setConversationView] = useState<ConversationView | null>(null);
  const [selected, setSelected] = useState<ScheduleOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionPhase, setActionPhase] = useState<"confirming" | "executing" | "stale" | "manual" | null>(null);
  const [receipts, setReceipts] = useState<ReceiptVM[] | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [supersedesProposalId, setSupersedesProposalId] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const autoStarted = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    onboardingApi.get().then((next) => {
      if (!next.completed) { router.replace(stepPath(next.current_step)); return; }
      setProfile(next);
      requestAnimationFrame(() => headingRef.current?.focus());
    }).catch((reason: Error) => setError(reason.message));
  }, [router]);

  async function submitMessage(message: string, intent = inferIntent(message)) {
    const clean = message.trim();
    if (!clean || busy) return;
    setQuestion(clean); setDraft(""); setReply(null); setSelected(null); setReceipts(null); setActionPhase(null); setError(""); setActionError(""); setBusy(true);
    try {
      const result = await askAssistant(clean, intent, conversationView?.conversation.conversation_id, supersedesProposalId ?? undefined);
      setReply(result.reply); setLive(result.live); if (result.view) setConversationView(result.view);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ripple couldn’t check your schedule.");
    } finally { setBusy(false); setSupersedesProposalId(null); }
  }

  useEffect(() => {
    const prompt = searchParams.get("prompt");
    if (profile && prompt && !autoStarted.current) {
      autoStarted.current = true;
      router.replace("/workspace");
      void submitMessage(prompt, (searchParams.get("intent") as AssistantIntent | null) ?? inferIntent(prompt));
    }
  }, [profile, router, searchParams]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submitMessage(draft);
  }

  const proposal = conversationView?.proposals.at(-1);
  const exactManifest = proposal && profile ? exactManifestView(proposal, profile) : null;

  async function selectOption(option: ScheduleOption) {
    setSelected(option); setActionError("");
    if (!proposal || !conversationView || !live) return;
    setBusy(true);
    try {
      const next = await proposalApi.select(proposal.proposal_id, proposal.version, option.id);
      setConversationView(next); setReply(mapConversationReply(next));
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : "Ripple couldn’t prepare that option."); }
    finally { setBusy(false); }
  }

  function refinePlan(option?: ScheduleOption) {
    const title = option?.title ?? selected?.title ?? proposal?.title ?? "this plan";
    setDraft(`Refine “${title}” to `); setActionError(""); setSupersedesProposalId(proposal?.proposal_id ?? null);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function rejectPlan() {
    if (!proposal) return;
    setBusy(true); setActionError("");
    try {
      const next = await proposalApi.reject(proposal.proposal_id, proposal.version);
      setConversationView(next); setReply(mapConversationReply(next)); setSelected(null);
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : "Ripple couldn’t set that plan aside."); }
    finally { setBusy(false); }
  }

  async function confirmAndExecute() {
    if (!proposal || !exactManifest) return;
    let approvalGranted = proposal.status === "APPROVED";
    setActionError(""); setActionPhase("confirming");
    try {
      const gate = proposal.status === "APPROVED" ? { view: conversationView!, approved: true } : await confirmProposalGate({ proposalId: proposal.proposal_id, expectedVersion: proposal.version, proposalHash: proposal.proposal_hash, manifestHash: exactManifest.manifestHash });
      const confirmed = gate.view;
      setConversationView(confirmed); setReply(mapConversationReply(confirmed));
      if (!gate.approved) {
        setActionPhase("stale");
        setActionError("Your schedule changed while this preview was open. Ask Ripple to refresh the options before confirming.");
        setReceipts(null);
        return;
      }
      approvalGranted = true;
      setActionPhase("executing"); setReceipts(waitingReceipts(exactManifest));
      const result = await proposalApi.execute(proposal.proposal_id);
      setConversationView(result.view); setReply(mapConversationReply(result.view)); setReceipts(receiptViews(result.receipts, exactManifest)); setActionPhase(null);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Ripple couldn’t complete those updates.";
      setActionError(message);
      setActionPhase(approvalGranted ? "manual" : /changed|expired|stale|review/i.test(message) ? "stale" : null);
      if (approvalGranted) setReceipts(waitingReceipts(exactManifest).map((receipt) => ({ ...receipt, status: "unknown", detail: "Ripple could not verify the final provider outcome. Check the connected app before trying again." })));
      else setReceipts(null);
    }
  }

  if (!profile) return <WorkspaceLoading error={error} />;
  const displayName = profile.account?.display_name === "Executive" ? "" : `, ${profile.account?.display_name ?? ""}`;
  const connectionsHealthy = Object.values(profile.connections).every((connection) => isConnectionCurrent(connection));
  return (
    <main className="v2-workspace-shell">
      <header className="v2-workspace-header">
        <Link className="v2-wordmark" href="/workspace" aria-label="Ripple workspace"><span>R</span>Ripple</Link>
        <div className="v2-workspace-identity"><span className="v2-avatar" aria-label="Signed-in operator">{profile.account?.display_name?.slice(0, 1) ?? "R"}</span></div>
      </header>
      <div className="v2-workspace">
        <section className="v2-assistant-shell">
          <div className="v2-welcome-row">
            <div><p className="v2-eyebrow">Executive workspace</p><h1 ref={headingRef} tabIndex={-1}>Good to see you{displayName}.</h1><p>Bring Ripple a schedule question. Exploring an idea never changes your connected apps.</p></div>
            <span className={`v2-ready-badge ${connectionsHealthy ? "" : "needs-attention"}`}><i />{connectionsHealthy ? "Ready to help" : "Connection needs attention"}</span>
          </div>
          <ConnectionHealth profile={profile} />
          <article className="v2-assistant-card">
            <span className="v2-assistant-symbol" aria-hidden="true">✦</span>
            {!question && !busy && !reply ? <EmptyState onSuggestion={(item) => void submitMessage(item.prompt, item.intent)} /> : null}
            {question ? <div className="v2-user-message"><span>You</span><p>{question}</p></div> : null}
            {busy ? <div className="v2-thinking" role="status"><span className="v2-button-spinner" aria-hidden="true" /><div><strong>Checking your schedule…</strong><p>Looking for constraints, open windows, and useful trade-offs.</p></div></div> : null}
            {error ? <div className="v2-inline-alert" role="alert"><strong>Ripple couldn’t finish that review.</strong><span>{error} No changes were made.</span><button type="button" onClick={() => void submitMessage(question)}>Try again</button></div> : null}
            {reply ? <AssistantResult reply={reply} live={live} selected={selected} busy={busy} proposalStatus={proposal?.status} onSelect={(option) => option ? void selectOption(option) : setSelected(null)} onRefine={refinePlan} /> : null}
            {actionError ? <div className="v2-inline-alert" role="alert"><strong>{actionPhase === "stale" ? "This plan needs another look." : actionPhase === "manual" ? "Check the connected apps before trying again." : "Ripple paused safely."}</strong><span>{actionError} Ripple did not infer success from this response.</span></div> : null}
            {exactManifest && proposal?.status === "READY_FOR_REVIEW" && !receipts ? <ActionConfirmationCard manifest={exactManifest} state={actionPhase === "stale" ? "stale" : actionPhase === "confirming" ? "confirming" : "ready"} onConfirm={() => void confirmAndExecute()} onReject={() => void rejectPlan()} onRefine={() => refinePlan()} /> : null}
            {proposal && ["INVALIDATED", "REJECTED"].includes(proposal.status) ? <div className="v2-calm-state" role="status"><strong>{proposal.status === "REJECTED" ? "Plan set aside" : "Schedule changed — refresh the plan"}</strong><span>{proposal.status === "REJECTED" ? "No connected apps were changed." : "Ask Ripple to prepare fresh options. The earlier confirmation is no longer valid, and no updates were started."}</span></div> : null}
            {proposal && (receipts || ["APPROVED", "EXECUTING", "COMPLETED", "PARTIALLY_COMPLETED", "NEEDS_MANUAL_REVIEW"].includes(proposal.status) || actionPhase === "executing" || actionPhase === "manual") ? <ExecutionResult receipts={receipts ?? (exactManifest ? waitingReceipts(exactManifest) : [])} status={actionPhase === "manual" ? "manual" : actionPhase === "executing" ? "executing" : executionPresentationState(proposal.status)} onContinue={proposal.status === "APPROVED" && actionPhase !== "executing" ? () => void confirmAndExecute() : undefined} /> : null}
            <AssistantComposer ref={composerRef} value={draft} onChange={setDraft} busy={busy || actionPhase === "confirming" || actionPhase === "executing"} onSubmit={onSubmit} />
          </article>
        </section>
      </div>
    </main>
  );
}

function EmptyState({ onSuggestion }: { onSuggestion(item: typeof suggestions[number]): void }) {
  return <>
    <h2>What should Ripple keep an eye on?</h2>
    <p className="v2-assistant-intro">Ask about your schedule, review a new disruption, or let Ripple find a more useful shape for your week.</p>
    <div className="v2-suggestions">{suggestions.map((item) => <button key={item.title} type="button" onClick={() => onSuggestion(item)}><strong>{item.title}</strong><span>{item.copy}</span><i aria-hidden="true">→</i></button>)}</div>
    <p className="v2-monitor-copy"><strong>Checks happen when you ask.</strong> Automatic monitoring is not enabled in this workspace.</p>
  </>;
}

const AssistantComposer = forwardRef<HTMLTextAreaElement, { value: string; onChange(value: string): void; busy: boolean; onSubmit(event: FormEvent): void }>(function AssistantComposer({ value, onChange, busy, onSubmit }, ref) {
  return <form className="v2-composer" onSubmit={onSubmit}>
    <label className="sr-only" htmlFor="ripple-question">Ask Ripple about your schedule</label>
    <textarea id="ripple-question" ref={ref} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Ask Ripple about your week…" rows={2} maxLength={1200} disabled={busy} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
    <button type="submit" disabled={busy || !value.trim()} aria-label="Send question">↑</button>
  </form>;
});

function AssistantResult({ reply, live, selected, busy, proposalStatus, onSelect, onRefine }: { reply: AssistantReply; live: boolean; selected: ScheduleOption | null; busy: boolean; proposalStatus?: string; onSelect(option: ScheduleOption | null): void; onRefine(option: ScheduleOption): void }) {
  return <section className="v2-assistant-result" aria-live="polite">
    {!live ? <div className="v2-demo-analysis">Demo analysis · Sample schedule data, not your connected calendar</div> : null}
    <p className="v2-eyebrow">Ripple’s read</p><h2>{reply.heading}</h2><p>{reply.summary}</p>
    <dl className="v2-insights">{reply.insights.map((item, index) => <div key={insightKey(item, index)} className={item.tone === "attention" ? "is-attention" : ""}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
    {reply.options.length ? <div className="v2-option-list"><h3>Useful next moves</h3>{reply.options.map((option) => <button disabled={busy} className={selected?.id === option.id ? "is-selected" : ""} type="button" key={option.id} onClick={() => onSelect(selected?.id === option.id ? null : option)}><span className="v2-option-radio" /><span><strong>{option.title}</strong><small>{option.summary}</small><em>{option.tradeoff}</em></span></button>)}</div> : null}
    {selected ? <div className="v2-option-detail"><div><p className="v2-eyebrow">Selected for review</p><strong>{selected.title}</strong><span>{selected.detail}</span></div><button type="button" disabled={busy} onClick={() => onRefine(selected)}>Refine this option</button><p>{busy ? "Preparing the exact plan…" : "Selecting an option does not change your connected apps."}</p></div> : null}
    <footer><span>Grounded in {reply.groundedIn}</span><strong>{proposalStatus && ["APPROVED", "EXECUTING", "COMPLETED", "PARTIALLY_COMPLETED", "NEEDS_MANUAL_REVIEW"].includes(proposalStatus) ? "See confirmed status below" : "✓ No changes were made"}</strong></footer>
  </section>;
}

function ConnectionHealth({ profile }: { profile: OnboardingProfile }) {
  return <div className="v2-connection-strip" aria-label="Connection status">{Object.values(profile.connections).map((connection) => {
    const current = isConnectionCurrent(connection);
    return <div key={connection.provider} className={!current ? "needs-attention" : ""}><ProviderMark provider={connection.provider} /><span><strong>{providerLabels[connection.provider]}</strong><small>{current ? connectionStatusLabel(connection.status, connection.verification_mode) : connection.status === "verified" ? "Check again" : connectionStatusLabel(connection.status, connection.verification_mode)}</small></span></div>;
  })}</div>;
}

function WorkspaceLoading({ error }: { error: string }) {
  return <main className="v2-workspace-shell"><div className="v2-workspace v2-workspace-loading" role="status"><span className="v2-assistant-symbol">✦</span><h1>{error ? "Your workspace needs a moment." : "Preparing your workspace…"}</h1><p>{error || "Bringing your connections and schedule context together."}</p>{error ? <button className="v2-primary-button" onClick={() => location.reload()}>Try again <span>→</span></button> : null}</div></main>;
}
