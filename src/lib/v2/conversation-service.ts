import { randomUUID } from "node:crypto";
import { DomainError } from "../domain/errors";
import { hash } from "../domain/hash";
import { getServerConfig } from "../config";
import type { Conversation, ConversationMessage, ConversationView, SchedulingIntent } from "./contracts";
import { V2_SCHEMA_VERSION } from "./contracts";
import { ConversationStore } from "./conversation-persistence";
import { createReadContext, privacyFilteredSnapshot, safeNotice, type ReadContextFactory, type SafeRecentNotice } from "./read-context";
import { analyzeSchedule, inferIntent, proposalContentHash, proposedTimeTarget } from "./schedule-analysis";
import { onboardingService, onboardingStore } from "./onboarding-service";
import { assistantPlanner, noAssistantPlanner, type AssistantPlanner } from "./smart-assistant";

const STARTER_PROMPTS: Record<"PREPARE_WEEK" | "FIND_TIME" | "REVIEW_RECENT_CHANGES", string> = {
  PREPARE_WEEK: "Prepare my week and show me the schedule pressure that matters most.",
  FIND_TIME: "Find 45 minutes for protected focus time this week.",
  REVIEW_RECENT_CHANGES: "Review recent changes against my upcoming commitments.",
};

type SessionAuthorizer = (sessionId: string) => Promise<{ calendarId: string }>;

function validateTimezone(timezone: string): void {
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); }
  catch { throw new DomainError("Choose a valid timezone.", "INVALID_REQUEST"); }
}

export class ConversationService {
  constructor(
    private readonly store: ConversationStore,
    private readonly contextFactory: ReadContextFactory,
    private readonly authorize: SessionAuthorizer,
    private readonly clock: () => Date = () => new Date(),
    private readonly planner: AssistantPlanner = noAssistantPlanner,
  ) {}

  async create(userId: string, starter?: keyof typeof STARTER_PROMPTS): Promise<ConversationView> {
    await this.authorize(userId);
    const created_at = this.clock().toISOString();
    const conversation: Conversation = { schema_version: V2_SCHEMA_VERSION, conversation_id: randomUUID(), user_id: userId, version: 1, status: "ACTIVE", created_at, updated_at: created_at };
    await this.store.create(conversation);
    if (starter) return this.send(userId, conversation.conversation_id, { content: STARTER_PROMPTS[starter], intent: starter, timezone: "Europe/Berlin" });
    return this.store.view(conversation.conversation_id, userId);
  }

  async get(userId: string, conversationId: string): Promise<ConversationView> {
    await this.authorize(userId);
    return this.store.view(conversationId, userId);
  }

  async send(userId: string, conversationId: string, input: { content: string; intent?: SchedulingIntent; timezone: string; supersedes_proposal_id?: string }): Promise<ConversationView> {
    validateTimezone(input.timezone);
    const { calendarId } = await this.authorize(userId);
    const current = await this.store.view(conversationId, userId);
    if (current.conversation.status !== "ACTIVE") throw new DomainError("This conversation is archived.", "INVALID_STATE");
    if (input.supersedes_proposal_id) {
      const prior = await this.store.proposal(input.supersedes_proposal_id, userId);
      if (prior.conversation_id !== conversationId || !["DRAFT", "READY_FOR_REVIEW"].includes(prior.status)) throw new DomainError("Only the current unexecuted proposal can be refined.", "INVALID_STATE");
      const { proposal_hash: _, ...base } = prior;
      const invalidated = { ...base, version: prior.version + 1, status: "INVALIDATED" as const };
      await this.store.updateProposal({ ...invalidated, proposal_hash: proposalContentHash(invalidated) }, prior.version);
    }
    const intent = input.intent ?? inferIntent(input.content);
    const now = this.clock();
    const context = this.contextFactory(calendarId);
    const providerSnapshot = await context.calendar.snapshot({
      start_at: now.toISOString(),
      end_at: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString(),
      timezone: input.timezone,
    });
    const snapshot = privacyFilteredSnapshot(providerSnapshot);
    if (!snapshot.complete) throw new DomainError("Ripple could not safely inspect the complete schedule window.", "PROVIDER_FAILURE");
    const notices: SafeRecentNotice[] = [];
    if (intent === "REVIEW_RECENT_CHANGES" || intent === "PREPARE_WEEK") {
      const config = getServerConfig();
      const scanned = await context.mail.scan({ label: config.GMAIL_INGEST_LABEL, limit: 5 });
      for (const messageId of scanned.message_ids.slice(0, 5)) {
        const source = await context.mail.get_message({ message_id: messageId });
        notices.push(safeNotice(source, hash(messageId).slice(0, 16)));
      }
    }
    const proposalTarget = proposedTimeTarget(providerSnapshot, input.content);
    const smartPlan = await this.planner.plan({
      content: input.content,
      intentHint: intent,
      timezone: input.timezone,
      now,
      snapshot,
      notices,
      recentMessages: current.messages,
      proposalTarget,
    });
    const proposal = analyzeSchedule({ conversationId, userId, intent, content: input.content, timezone: input.timezone, snapshot, notices, now, assistantPlan: proposalTarget && smartPlan?.alternatives.length === 0 ? null : smartPlan, proposalTarget });
    const userMessage: ConversationMessage = { schema_version: V2_SCHEMA_VERSION, message_id: randomUUID(), conversation_id: conversationId, role: "USER", content: input.content, created_at: now.toISOString() };
    const detail = proposal.insights.slice(0, 3).map((insight) => insight.detail).join(" ");
    const assistantMessage: ConversationMessage = { schema_version: V2_SCHEMA_VERSION, message_id: randomUUID(), conversation_id: conversationId, role: "ASSISTANT", content: `${proposal.summary} ${detail}`.trim(), created_at: new Date(now.getTime() + 1).toISOString(), proposal_id: proposal.proposal_id };
    const updated: Conversation = { ...current.conversation, version: current.conversation.version + 1, updated_at: assistantMessage.created_at };
    await this.store.append(updated, [userMessage, assistantMessage], proposal, current.conversation.version);
    return this.store.view(conversationId, userId);
  }
}

export async function authorizeV2Session(sessionId: string): Promise<{ calendarId: string }> {
  const { profile } = await onboardingService.getOrCreate(sessionId);
  if (profile.session_id !== sessionId || !profile.completed) throw new DomainError("Finish setup before using the assistant.", "INVALID_STATE");
  const calendarId = await onboardingStore.getCalendarSelection(sessionId);
  if (!calendarId) throw new DomainError("Choose a calendar before using the assistant.", "INVALID_STATE");
  return { calendarId };
}
export const conversationStore = new ConversationStore();
export const conversationService = new ConversationService(conversationStore, createReadContext, authorizeV2Session, () => new Date(), assistantPlanner);
