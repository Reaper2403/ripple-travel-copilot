import type { ExecutionReceipt, RecoveryCase } from "./domain/types";

export type ApiErrorCode =
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "INVALID_STATE"
  | "STALE_APPROVAL"
  | "CONFIGURATION"
  | "PROVIDER_FAILURE";

export interface ApiErrorBody {
  code: ApiErrorCode;
  retryable: boolean;
  safe_message: string;
  trace_id: string;
}

export interface CaseResponse {
  case: RecoveryCase;
  receipts: ExecutionReceipt[];
  provider_mode: "fake" | "real";
}

export interface CreateDemoCaseRequest {
  scenario?: "delay" | "cancellation" | "ambiguous";
}

export interface AnalyzeCaseRequest {
  force_fallback?: boolean;
}

export interface ApproveCaseRequest {
  plan_id: string;
  case_version?: number;
  actor_id?: string;
  execute?: boolean;
}

export interface BenchScenarioResult {
  id: string;
  name: string;
  passed: boolean;
  assertions: Array<{ description: string; passed: boolean }>;
  duration_ms: number;
}

export interface BenchResponse {
  passed: number;
  total: number;
  score_percent: number;
  forbidden_effects: number;
  scenarios: BenchScenarioResult[];
}

export interface ReplayResponse extends CaseResponse {
  replay: {
    new_actions: number;
    reused_actions: number;
    reused_provider_refs: string[];
  };
}

// Stable UI-facing routes.
export const API_ROUTES = {
  demo: "/api/demo",
  createCase: "/api/cases/demo",
  analyze: (caseId: string) => `/api/cases/${caseId}/analyze`,
  approve: (caseId: string) => `/api/cases/${caseId}/approve`,
  execute: (caseId: string) => `/api/cases/${caseId}/execute`,
  receipts: (caseId: string) => `/api/cases/${caseId}/receipts`,
  bench: "/api/bench",
  demoApprove: "/api/cases/demo/approve",
  demoReplay: "/api/cases/demo/replay",
  v2Onboarding: "/api/v2/onboarding",
  v2OnboardingAccount: "/api/v2/onboarding/account",
  v2GmailVerify: "/api/v2/connections/gmail/verify",
  v2CalendarOptions: "/api/v2/connections/calendar/options",
  v2CalendarSelect: "/api/v2/connections/calendar/select",
  v2NotionVerify: "/api/v2/connections/notion/verify",
  v2OnboardingComplete: "/api/v2/onboarding/complete",
  v2Conversations: "/api/v2/conversations",
  v2Conversation: (conversationId: string) => `/api/v2/conversations/${conversationId}`,
  v2ConversationMessages: (conversationId: string) => `/api/v2/conversations/${conversationId}/messages`,
  v2ProposalSelect: (proposalId: string) => `/api/v2/proposals/${proposalId}/select`,
  v2ProposalReject: (proposalId: string) => `/api/v2/proposals/${proposalId}/reject`,
  v2ProposalConfirm: (proposalId: string) => `/api/v2/proposals/${proposalId}/confirm`,
  v2ProposalExecute: (proposalId: string) => `/api/v2/proposals/${proposalId}/execute`,
} as const;
