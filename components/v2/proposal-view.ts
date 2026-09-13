import type { PublicConversationView, PublicReceipt } from "@/src/lib/v2/contracts";
import type { ExactActionVM, ExactManifestVM, ReceiptVM } from "./action-confirmation-card";
import type { OnboardingProfile } from "./types";

export type PublicProposal = PublicConversationView["proposals"][number];

export function insightKey(item: { label: string; value: string }, index: number): string {
  return `${item.label}\u0000${item.value}\u0000${index}`;
}

function dateTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(value));
}

function taskStatus(status: "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "DONE"): string {
  return status === "NOT_STARTED" ? "Not started" : status === "IN_PROGRESS" ? "In progress" : status === "DONE" ? "Done" : "Blocked";
}

export function exactManifestView(proposal: PublicProposal, profile: OnboardingProfile): ExactManifestVM | null {
  if (!proposal.manifest) return null;
  const actions: ExactActionVM[] = proposal.manifest.actions.map((action) => {
    if (action.type === "NOTION_TRACKER_UPSERT") return {
      id: action.action_id,
      provider: "notion" as const,
      title: action.title,
      destination: profile.connections.notion.destination_label ?? profile.connections.notion.display_name ?? "Verified Notion destination",
      executiveSummary: action.executive_summary,
      trackerStatus: action.status === "IN_PROGRESS" ? "In progress" : action.status === "COMPLETED" ? "Completed" : action.status === "BLOCKED" ? "Blocked" : "Planned",
      chosenDecision: action.chosen_decision,
      impact: action.impact,
      nextDeadline: action.next_deadline ? dateTime(action.next_deadline, proposal.calendar_window.timezone) : undefined,
      affectedCommitments: action.affected_commitments.map((item) => ({ title: item.title, time: item.time_label, owner: item.owner_label, impact: item.impact, response: item.chosen_response })),
      decisions: action.decisions.map((item) => ({ decision: item.decision, decidedAt: dateTime(item.decided_at, proposal.calendar_window.timezone) })),
      tasks: action.tasks.map((task) => ({
        id: task.task_id,
        title: task.title,
        owner: task.owner_label,
        due: task.due_at ? dateTime(task.due_at, task.timezone ?? proposal.calendar_window.timezone) : "No deadline",
        status: taskStatus(task.status),
      })),
    };
    if (action.type === "CALENDAR_HOLD_UPSERT") return {
      id: action.action_id,
      provider: "calendar" as const,
      title: action.title,
      calendar: profile.connections.calendar.destination_label ?? profile.connections.calendar.display_name ?? "Selected calendar",
      start: dateTime(action.start_at, action.timezone),
      end: new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: action.timezone }).format(new Date(action.end_at)),
      timezone: action.timezone,
      attendees: action.proposal_for ? [action.proposal_for.organizer_email] : [],
    };
    return {
      id: action.action_id,
      provider: "gmail" as const,
      title: "Send stakeholder update",
      recipients: action.to,
      cc: action.cc,
      bcc: action.bcc,
      subject: action.subject,
      body: action.body_text,
    };
  });
  return {
    proposalId: proposal.proposal_id,
    version: proposal.version,
    proposalHash: proposal.proposal_hash,
    manifestHash: proposal.manifest.manifest_hash,
    expiresAt: proposal.expires_at,
    actions,
    assumptions: proposal.assumptions,
  };
}

export function proposalPresentationState(status: PublicProposal["status"]): "ready" | "approved" | "executing" | "stale" | "rejected" | "complete" | "partial" | "manual" {
  if (status === "INVALIDATED") return "stale";
  if (status === "REJECTED") return "rejected";
  if (status === "APPROVED") return "approved";
  if (status === "EXECUTING") return "executing";
  if (status === "COMPLETED") return "complete";
  if (status === "PARTIALLY_COMPLETED") return "partial";
  if (status === "NEEDS_MANUAL_REVIEW") return "manual";
  return "ready";
}

export function safeReceiptLink(value?: string): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : undefined; }
  catch { return undefined; }
}

export function waitingReceipts(manifest: ExactManifestVM): ReceiptVM[] {
  return manifest.actions.map((action) => ({ id: action.id, provider: action.provider, label: action.title, status: "waiting", detail: "Waiting for confirmation-backed execution." }));
}

export function receiptViews(receipts: PublicReceipt[], manifest: ExactManifestVM): ReceiptVM[] {
  const actionById = new Map(manifest.actions.map((action) => [action.id, action]));
  return receipts.map((receipt) => {
    const action = actionById.get(receipt.action_id);
    const provider = receipt.connector === "ARTIFACT" ? "notion" as const : receipt.connector === "CALENDAR" ? "calendar" as const : "gmail" as const;
    const status: ReceiptVM["status"] = receipt.status === "SUCCEEDED" ? receipt.verified ? "verified" : "unknown" : receipt.status === "STARTED" ? "running" : receipt.status === "PLANNED" ? "waiting" : receipt.status === "UNKNOWN" ? "unknown" : "failed";
    const detail = receipt.safe_error ?? (status === "verified" ? "Confirmed by the connected app." : status === "unknown" ? "The connected app did not return a certain result. Check it manually before trying again." : status === "failed" ? "This update was not completed." : status === "running" ? "The connected app is processing this update." : "Waiting to begin.");
    return { id: receipt.action_id, provider, label: action?.title ?? (provider === "notion" ? "Update follow-through workspace" : provider === "calendar" ? "Update Calendar" : "Send stakeholder message"), status, detail, link: status === "verified" ? safeReceiptLink(receipt.external_url) : undefined };
  });
}

export function executionPresentationState(status: PublicProposal["status"]): "executing" | "complete" | "partial" | "manual" {
  if (status === "COMPLETED") return "complete";
  if (status === "NEEDS_MANUAL_REVIEW") return "manual";
  if (status === "PARTIALLY_COMPLETED") return "partial";
  return "executing";
}

export function canExecuteProposal(status: PublicProposal["status"]): boolean {
  return status === "APPROVED";
}
