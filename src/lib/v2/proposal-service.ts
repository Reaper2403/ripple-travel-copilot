import { randomUUID } from "node:crypto";
import { DomainError } from "../domain/errors";
import { hash } from "../domain/hash";
import type { ActionManifest, CalendarAction, CalendarSnapshot, FollowThroughTrackerAction } from "../domain/types";
import { executeManifest } from "../manifest-executor";
import { providerPorts, store as receiptStore } from "../orchestrator";
import type { ProviderPorts } from "../ports";
import type { DurableStore } from "../persistence";
import { v2ActionManifestSchema, publicConversationView, type PublicConversationView, type SchedulingProposal, type V2ActionManifest } from "./contracts";
import { authorizeV2Session, conversationStore } from "./conversation-service";
import { createReadContext } from "./read-context";
import type { ReadContextFactory } from "./read-context";
import { proposalContentHash } from "./schedule-analysis";
import type { ConversationStore } from "./conversation-persistence";

function manifestFor(proposal: SchedulingProposal, alternativeId: string, now: Date): V2ActionManifest {
  const alternative = proposal.alternatives.find((item) => item.alternative_id === alternativeId);
  if (!alternative?.candidate_block) throw new DomainError("This option is informational and cannot be executed.", "INVALID_REQUEST");
  const trackerActionId = `tracker-${hash(`${proposal.proposal_id}:${alternativeId}`).slice(0, 20)}`;
  const calendarActionId = `calendar-${hash(`${alternativeId}:${proposal.version}`).slice(0, 20)}`;
  const proposedTime = proposal.target_event;
  const labeledEmail = proposal.labeled_email_action;
  const emailMeeting = labeledEmail && ["MEETING_REQUEST", "RESCHEDULE"].includes(labeledEmail.kind) ? labeledEmail : undefined;
  const tracker: FollowThroughTrackerAction = {
    type: "NOTION_TRACKER_UPSERT", action_id: trackerActionId, idempotency_key: hash(`${proposal.proposal_id}:${trackerActionId}`), required: true,
    title: `Ripple · ${proposal.title}`.slice(0, 200), executive_summary: `${proposal.summary} Chosen plan: ${alternative.summary}`,
    decision_at: now.toISOString(), status: "PLANNED", chosen_decision: alternative.title,
    impact: proposal.insights.filter((insight) => insight.kind !== "INFORMATION").map((insight) => insight.detail).join(" ") || "No immediate schedule conflict; this block protects intentional work.",
    next_deadline: alternative.candidate_block.start_at, last_updated_at: now.toISOString(),
    affected_commitments: proposal.insights.filter((insight) => insight.event_refs.length).slice(0, 5).map((insight) => ({ title: insight.title, time_label: "Within the reviewed schedule window", owner_label: "Calendar owner", impact: insight.detail, chosen_response: alternative.summary })),
    decisions: [
      { decision: alternative.title, decided_at: now.toISOString() },
      { decision: proposedTime?.owned_by_operator ? `Move the existing ${proposedTime.title} event and clear its original time after confirmation.` : proposedTime ? `Send ${proposedTime.organizer_email} a proposed-time calendar invitation; keep the original invitation unchanged until the organizer responds.` : emailMeeting ? `Send ${emailMeeting.sender_email} a calendar invitation only after this exact plan is confirmed.` : "Existing meetings remain unchanged; review or move them manually if needed.", decided_at: now.toISOString() },
    ],
    tasks: [
      { task_id: hash(`${proposal.proposal_id}:prepare`).slice(0, 16), title: "Prepare for the protected session", owner_label: "Executive", due_at: alternative.candidate_block.start_at, timezone: alternative.candidate_block.timezone, status: "NOT_STARTED", source_action_id: trackerActionId },
      { task_id: hash(`${proposal.proposal_id}:review`).slice(0, 16), title: "Review outcomes and next decisions", owner_label: "Executive", due_at: alternative.candidate_block.end_at, timezone: alternative.candidate_block.timezone, status: "NOT_STARTED", source_action_id: trackerActionId },
    ],
  };
  const calendar: CalendarAction = {
    type: "CALENDAR_HOLD_UPSERT", action_id: calendarActionId, idempotency_key: hash(`${proposal.proposal_id}:${calendarActionId}`), required: true,
    title: proposedTime?.owned_by_operator ? proposedTime.title : proposedTime ? `Proposed time · ${proposedTime.title}` : labeledEmail ? labeledEmail.title : alternative.candidate_block.title,
    ...(proposedTime?.owned_by_operator ? {} : { description: proposedTime ? `Could we move ${proposedTime.title} to this time? Please accept if it works, or suggest another time. The original invitation remains unchanged.` : emailMeeting ? `Proposed in response to “${emailMeeting.subject}”. Please accept if this time works, or suggest another.` : labeledEmail ? `Protected by Ripple in response to “${labeledEmail.subject}” after explicit confirmation.` : "Created by Ripple after explicit confirmation." }),
    start_at: alternative.candidate_block.start_at, end_at: alternative.candidate_block.end_at, timezone: alternative.candidate_block.timezone,
    ...(proposedTime?.owned_by_operator ? { reschedule_owned: { event_ref: proposedTime.event_ref, source_calendar: proposedTime.source_calendar, original_title: proposedTime.title, expected_version: proposedTime.provider_version ?? "unknown" } } : proposedTime?.organizer_email ? { proposal_for: { event_ref: proposedTime.event_ref, source_calendar: proposedTime.source_calendar, original_title: proposedTime.title, organizer_email: proposedTime.organizer_email } } : {}),
    ...(emailMeeting ? { email_request: { message_ref: emailMeeting.message_ref, sender_email: emailMeeting.sender_email, subject: emailMeeting.subject } } : {}),
  };
  const unsigned = { schema_version: "1.0" as const, case_id: proposal.proposal_id, case_version: proposal.version + 1, plan_id: alternativeId, actions: [tracker, calendar] };
  const manifest = { ...unsigned, manifest_hash: hash(unsigned) };
  return v2ActionManifestSchema.parse(manifest);
}

function withHash(proposal: Omit<SchedulingProposal, "proposal_hash">): SchedulingProposal {
  return { ...proposal, proposal_hash: proposalContentHash(proposal) };
}

function safeProviderUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const notion = url.hostname === "notion.so" || url.hostname.endsWith(".notion.so");
    const calendar = url.hostname === "calendar.google.com" || (url.hostname === "www.google.com" && url.pathname.startsWith("/calendar/"));
    return url.protocol === "https:" && (notion || calendar) ? url.toString() : undefined;
  } catch { return undefined; }
}

function selectedBlockConflicts(proposal: SchedulingProposal, snapshot: CalendarSnapshot): boolean {
  const selected = proposal.alternatives.find((alternative) => alternative.alternative_id === proposal.selected_alternative_id)?.candidate_block;
  if (!selected) return true;
  const start = Date.parse(selected.start_at);
  const end = Date.parse(selected.end_at);
  return snapshot.events.some((event) => start < Date.parse(event.end_at) && end > Date.parse(event.start_at));
}

export class ProposalService {
  constructor(
    private readonly proposals: ConversationStore = conversationStore,
    private readonly authorize: (userId: string) => Promise<{ calendarId: string }> = authorizeV2Session,
    private readonly contextFactory: ReadContextFactory = createReadContext,
    private readonly portsFactory: () => ProviderPorts = providerPorts,
    private readonly receiptsStore: DurableStore = receiptStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async select(userId: string, proposalId: string, expectedVersion: number, alternativeId: string): Promise<PublicConversationView> {
    await this.authorize(userId);
    const current = await this.proposals.proposal(proposalId, userId);
    if (current.version !== expectedVersion) throw new DomainError("The proposal changed. Refresh and try again.", "STALE_APPROVAL");
    if (!['DRAFT', 'READY_FOR_REVIEW'].includes(current.status)) throw new DomainError("This proposal can no longer be changed.", "INVALID_STATE");
    if (Date.parse(current.expires_at) <= this.clock().getTime()) throw new DomainError("This proposal expired. Ask Ripple to refresh it.", "STALE_APPROVAL");
    const manifest = manifestFor(current, alternativeId, this.clock());
    const { proposal_hash: _, ...base } = current;
    const updated = withHash({ ...base, version: current.version + 1, status: "READY_FOR_REVIEW", selected_alternative_id: alternativeId, manifest });
    await this.proposals.updateProposal(updated, current.version);
    return publicConversationView(await this.proposals.view(current.conversation_id, userId));
  }

  async reject(userId: string, proposalId: string, expectedVersion: number): Promise<PublicConversationView> {
    await this.authorize(userId);
    const current = await this.proposals.proposal(proposalId, userId);
    if (current.version !== expectedVersion || !['DRAFT', 'READY_FOR_REVIEW'].includes(current.status)) throw new DomainError("This proposal can no longer be rejected.", "INVALID_STATE");
    const { proposal_hash: _, manifest: _manifest, selected_alternative_id: _selected, ...base } = current;
    const updated = withHash({ ...base, version: current.version + 1, status: "REJECTED" });
    await this.proposals.updateProposal(updated, current.version);
    return publicConversationView(await this.proposals.view(current.conversation_id, userId));
  }

  async confirm(userId: string, proposalId: string, input: { expected_version: number; proposal_hash: string; manifest_hash: string }): Promise<PublicConversationView> {
    const { calendarId } = await this.authorize(userId);
    const current = await this.proposals.proposal(proposalId, userId);
    if (current.status !== "READY_FOR_REVIEW" || current.version !== input.expected_version || !current.manifest) throw new DomainError("Review the latest proposal before confirming.", "STALE_APPROVAL");
    if (Date.parse(current.expires_at) <= this.clock().getTime() || current.proposal_hash !== input.proposal_hash || current.manifest.manifest_hash !== input.manifest_hash || proposalContentHash(current) !== current.proposal_hash) throw new DomainError("The confirmation no longer matches this proposal.", "STALE_APPROVAL");
    const { manifest_hash: declared, ...unsignedManifest } = current.manifest;
    if (hash(unsignedManifest) !== declared) throw new DomainError("The action preview failed integrity verification.", "STALE_APPROVAL");
    const fresh = await this.contextFactory(calendarId).calendar.snapshot(current.calendar_window);
    if (!fresh.complete || fresh.snapshot_hash !== current.calendar_snapshot_hash || selectedBlockConflicts(current, fresh)) {
      const { proposal_hash: _, ...base } = current;
      const invalidated = withHash({ ...base, version: current.version + 1, status: "INVALIDATED" });
      await this.proposals.updateProposal(invalidated, current.version);
      return publicConversationView(await this.proposals.view(current.conversation_id, userId));
    }
    const { proposal_hash: _, ...base } = current;
    const approved = withHash({ ...base, version: current.version + 1, status: "APPROVED" });
    await this.proposals.transitionWithApproval(approved, current.version, { proposal_id: proposalId, user_id: userId, proposal_version: approved.version, proposal_hash: current.proposal_hash, manifest_hash: current.manifest.manifest_hash, approved_at: this.clock().toISOString(), expires_at: current.expires_at });
    return publicConversationView(await this.proposals.view(current.conversation_id, userId));
  }

  async execute(userId: string, proposalId: string): Promise<{ view: PublicConversationView; receipts: Array<{ action_id: string; connector: "GMAIL" | "CALENDAR" | "ARTIFACT"; operation: string; status: "PLANNED" | "STARTED" | "SUCCEEDED" | "FAILED" | "UNKNOWN" | "SKIPPED" | "COMPENSATED"; verified?: boolean; external_url?: string; safe_error?: string }> }> {
    await this.authorize(userId);
    let current = await this.proposals.proposal(proposalId, userId);
    if (!["APPROVED", "EXECUTING", "PARTIALLY_COMPLETED"].includes(current.status) || !current.manifest) throw new DomainError("Confirm this proposal before execution.", "INVALID_STATE");
    if (current.status === "APPROVED") {
      const { calendarId } = await this.authorize(userId);
      const fresh = await this.contextFactory(calendarId).calendar.snapshot(current.calendar_window);
      if (!fresh.complete || fresh.snapshot_hash !== current.calendar_snapshot_hash || selectedBlockConflicts(current, fresh)) {
        const { proposal_hash: _, ...base } = current;
        const invalidated = withHash({ ...base, version: current.version + 1, status: "INVALIDATED" });
        await this.proposals.updateProposal(invalidated, current.version);
        throw new DomainError("The calendar changed after confirmation. Ask Ripple to refresh the proposal.", "STALE_APPROVAL");
      }
    }
    const leaseOwner = randomUUID();
    const leaseMs = 5 * 60 * 1000;
    const begun = await this.proposals.beginExecution(proposalId, userId, leaseOwner, this.clock(), leaseMs);
    current = begun.proposal;
    const manifest = current.manifest!;
    if (begun.approval.manifest_hash !== manifest.manifest_hash) throw new DomainError("Approval integrity check failed.", "STALE_APPROVAL");
    const result = await executeManifest({ subjectId: proposalId, subjectVersion: current.version, planHash: begun.approval.proposal_hash, sourceSnapshotHash: current.source_context_hash, calendarSnapshotHash: current.calendar_snapshot_hash, manifest: manifest as ActionManifest, ports: this.portsFactory(), receipts: this.receiptsStore, beforeAction: async () => this.proposals.assertExecutionLease(proposalId, userId, leaseOwner, this.clock(), leaseMs) });
    const executingVersion = current.version;
    const { proposal_hash: _old, ...executingBase } = current;
    current = withHash({ ...executingBase, version: executingVersion + 1, status: result.completed ? "COMPLETED" : "PARTIALLY_COMPLETED" });
    await this.proposals.finishExecution(current, executingVersion, leaseOwner);
    const receipts = result.receipts.map((receipt) => ({ action_id: receipt.action_id, connector: receipt.connector, operation: receipt.operation, status: receipt.status, verified: receipt.verified, external_url: safeProviderUrl(receipt.external_url), safe_error: receipt.error?.safe_message }));
    return { view: publicConversationView(await this.proposals.view(current.conversation_id, userId)), receipts };
  }
}

export const proposalService = new ProposalService();
