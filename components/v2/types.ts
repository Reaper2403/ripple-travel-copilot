import type { CalendarOption, ConnectionProvider, ConnectionSummary, OnboardingProfileView, OnboardingStep, ProposalExecutionResponse, PublicConversationView, PublicReceipt, SchedulingIntent, SchedulingProposal } from "@/src/lib/v2/contracts";

export type Provider = ConnectionProvider;
export type SetupStep = OnboardingStep;
export type OnboardingProfile = OnboardingProfileView;
export type ConversationView = PublicConversationView;
export type { CalendarOption, ConnectionSummary, ProposalExecutionResponse, PublicReceipt, SchedulingIntent, SchedulingProposal };

export type AssistantIntent = "prepare_week" | "review_changes" | "approval_demo" | "find_time" | "custom";

export interface ScheduleOption {
  id: string;
  title: string;
  summary: string;
  tradeoff: string;
  detail: string;
  readOnly: boolean;
}

export interface AssistantReply {
  conversationId?: string;
  heading: string;
  summary: string;
  insights: Array<{ label: string; value: string; tone?: "neutral" | "attention" }>;
  options: ScheduleOption[];
  groundedIn: string;
  readOnly: true;
}
