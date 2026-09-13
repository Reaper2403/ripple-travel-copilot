import type { AssistantIntent, AssistantReply, CalendarOption, ConversationView, OnboardingProfile, ProposalExecutionResponse, SchedulingIntent } from "./types";

export class ProductRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ProductRequestError(body?.safe_message ?? body?.message ?? "Ripple couldn’t complete that request.", response.status);
  }
  return body as T;
}

export const onboardingApi = {
  get: () => request<OnboardingProfile>("/api/v2/onboarding"),
  account: (displayName: string) => request<OnboardingProfile>("/api/v2/onboarding/account", { method: "POST", body: JSON.stringify({ display_name: displayName }) }),
  verifyGmail: () => request<OnboardingProfile>("/api/v2/connections/gmail/verify", { method: "POST", body: "{}" }),
  calendarOptions: () => request<{ schema_version: "2.0"; options: CalendarOption[] }>("/api/v2/connections/calendar/options"),
  selectCalendar: (selectionToken: string) => request<OnboardingProfile>("/api/v2/connections/calendar/select", { method: "POST", body: JSON.stringify({ selection_token: selectionToken }) }),
  verifyNotion: () => request<OnboardingProfile>("/api/v2/connections/notion/verify", { method: "POST", body: "{}" }),
  complete: () => request<OnboardingProfile>("/api/v2/onboarding/complete", { method: "POST", body: "{}" }),
};

function fixtureReply(intent: AssistantIntent): AssistantReply {
  if (intent === "review_changes") return {
    heading: "One travel change deserves attention",
    summary: "A cancelled arrival now overlaps four commitments. The customer review is the most time-sensitive; the remaining meetings can be handled remotely.",
    insights: [
      { label: "Most urgent", value: "Customer roadmap review · Monday, 9:30 AM PDT", tone: "attention" },
      { label: "Recovery window", value: "90 minutes after the revised arrival" },
    ],
    options: [
      { id: "review-case", title: "Review the recovery plan", summary: "See the exact evidence, affected meetings, and proposed response.", tradeoff: "Nothing changes until you approve the detailed plan.", detail: "Open the existing Ripple case", readOnly: true },
    ],
    groundedIn: "Demo executive calendar and travel-notice fixture",
    readOnly: true,
  };
  if (intent === "approval_demo") return {
    heading: "Here’s how Ripple keeps you in control",
    summary: "Ripple can explore and compare options in conversation. Before it changes Calendar, Gmail, or Notion, it presents every exact action in a separate confirmation card.",
    insights: [
      { label: "Conversation", value: "Exploration only" },
      { label: "External changes", value: "Require a separate confirmation" },
    ],
    options: [],
    groundedIn: "Ripple approval policy",
    readOnly: true,
  };
  return {
    heading: "Your week has two pressure points",
    summary: "Tuesday is fragmented by back-to-back meetings, and Thursday’s board review has no protected preparation time. Wednesday afternoon is the strongest focus window.",
    insights: [
      { label: "Tightest transition", value: "Tuesday, 11:00–11:15 AM PDT", tone: "attention" },
      { label: "Missing preparation", value: "Board review · 45 minutes recommended", tone: "attention" },
      { label: "Best focus window", value: "Wednesday, 1:30–3:30 PM PDT" },
    ],
    options: [
      { id: "protect-focus", title: "Protect the focus window", summary: "Reserve Wednesday, 1:30–3:30 PM PDT for focused work.", tradeoff: "Creates one new private block; no meetings move.", detail: "2-hour focus block", readOnly: true },
      { id: "add-board-prep", title: "Add board preparation", summary: "Hold Thursday, 8:45–9:30 AM PDT before the board review.", tradeoff: "Uses the only open buffer before the session.", detail: "45-minute preparation block", readOnly: true },
    ],
    groundedIn: "Demo executive calendar fixture",
    readOnly: true,
  };
}

const serverIntentByIntent: Record<AssistantIntent, SchedulingIntent> = {
  prepare_week: "PREPARE_WEEK",
  find_time: "FIND_TIME",
  review_changes: "REVIEW_RECENT_CHANGES",
  approval_demo: "UNKNOWN",
  custom: "UNKNOWN",
};

export function mapConversationReply(view: ConversationView): AssistantReply {
  const proposal = view.proposals.at(-1);
  if (!proposal) throw new ProductRequestError("Ripple didn’t return a schedule review.", 502);
  return {
    conversationId: view.conversation.conversation_id,
    heading: proposal.title,
    summary: proposal.summary,
    insights: proposal.insights.slice(0, 6).map((insight) => ({
      label: insight.title,
      value: insight.detail,
      tone: insight.kind === "CONFLICT" || insight.kind === "TIGHT_TRANSITION" || insight.kind === "MISSING_PREP" || insight.kind === "RECENT_CHANGE" ? "attention" : "neutral",
    })),
    options: (["DRAFT", "READY_FOR_REVIEW"].includes(proposal.status) ? proposal.alternatives : []).map((alternative) => ({
      id: alternative.alternative_id,
      title: alternative.title,
      summary: alternative.summary,
      tradeoff: alternative.tradeoffs.join(" · ") || "No material trade-off identified.",
      detail: alternative.candidate_block ? `${alternative.candidate_block.title} · ${alternative.candidate_block.timezone}` : "Read-only scheduling option",
      readOnly: true,
    })),
    groundedIn: "your selected calendar and bounded schedule window",
    readOnly: true,
  };
}

export async function askAssistant(message: string, intent: AssistantIntent, conversationId?: string, supersedesProposalId?: string): Promise<{ reply: AssistantReply; live: boolean; view?: ConversationView }> {
  if (intent === "approval_demo") return { reply: fixtureReply(intent), live: true };
  try {
    const created = conversationId ? null : await request<ConversationView>("/api/v2/conversations", { method: "POST", body: "{}" });
    const targetId = conversationId ?? created!.conversation.conversation_id;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";
    const view = await request<ConversationView>(`/api/v2/conversations/${targetId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: message, timezone, ...(intent === "custom" ? {} : { intent: serverIntentByIntent[intent] }), ...(supersedesProposalId ? { supersedes_proposal_id: supersedesProposalId } : {}) }),
    });
    return { reply: mapConversationReply(view), live: true, view };
  } catch (error) {
    if (error instanceof ProductRequestError && error.status !== 404 && error.status !== 501) throw error;
    return { reply: fixtureReply(intent), live: false };
  }
}

export const proposalApi = {
  select: (proposalId: string, expectedVersion: number, alternativeId: string) => request<ConversationView>(`/api/v2/proposals/${proposalId}/select`, { method: "POST", body: JSON.stringify({ expected_version: expectedVersion, alternative_id: alternativeId }) }),
  reject: (proposalId: string, expectedVersion: number) => request<ConversationView>(`/api/v2/proposals/${proposalId}/reject`, { method: "POST", body: JSON.stringify({ expected_version: expectedVersion }) }),
  confirm: (proposalId: string, expectedVersion: number, proposalHash: string, manifestHash: string) => request<ConversationView>(`/api/v2/proposals/${proposalId}/confirm`, { method: "POST", body: JSON.stringify({ expected_version: expectedVersion, proposal_hash: proposalHash, manifest_hash: manifestHash }) }),
  execute: (proposalId: string) => request<ProposalExecutionResponse>(`/api/v2/proposals/${proposalId}/execute`, { method: "POST", body: "{}" }),
};

export async function confirmProposalGate(input: { proposalId: string; expectedVersion: number; proposalHash: string; manifestHash: string }): Promise<{ view: ConversationView; approved: boolean }> {
  const view = await proposalApi.confirm(input.proposalId, input.expectedVersion, input.proposalHash, input.manifestHash);
  const current = view.proposals.find((proposal) => proposal.proposal_id === input.proposalId);
  return { view, approved: current?.status === "APPROVED" };
}
