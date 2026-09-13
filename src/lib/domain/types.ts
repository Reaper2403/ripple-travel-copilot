export const CASE_STATES = [
  "INGESTED",
  "ANALYZING",
  "NEEDS_CLARIFICATION",
  "READY_FOR_REVIEW",
  "APPROVED",
  "REJECTED",
  "EXECUTING",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "NEEDS_MANUAL_REVIEW",
] as const;

export type CaseState = (typeof CASE_STATES)[number];
export type DisruptionKind =
  | "DELAY"
  | "CANCELLATION"
  | "SCHEDULE_CHANGE"
  | "MISSED_CONNECTION"
  | "HOTEL_CHANGE"
  | "UNKNOWN";

export interface SourceMessage {
  message_id: string;
  thread_id: string;
  source_version: string;
  content_hash: string;
  received_at: string;
  from: string;
  subject: string;
  body_text: string;
}

export interface EvidenceFact {
  field: string;
  value: unknown;
  evidence: { message_id: string; excerpt: string; start_offset?: number; end_offset?: number };
  confidence: number;
}

export interface TripSegment {
  segment_id: string;
  kind: "FLIGHT" | "RAIL" | "HOTEL" | "OTHER";
  carrier?: string;
  service_number?: string;
  origin?: string;
  destination?: string;
  scheduled_start_at?: string;
  scheduled_end_at?: string;
  revised_start_at?: string;
  revised_end_at?: string;
  source_timezone?: string;
}

export interface DisruptionFacts {
  schema_version: "1.0";
  kind: DisruptionKind;
  segments: TripSegment[];
  facts: EvidenceFact[];
  ambiguities: string[];
  case_confidence: number;
}

export interface CalendarEventSnapshot {
  event_ref: string;
  provider_version: string;
  title: string;
  start_at: string;
  end_at: string;
  timezone: string;
  attendees: string[];
  organizer?: string;
  owned_by_operator: boolean;
  visibility: "DEFAULT" | "PRIVATE" | "OPAQUE";
}

export interface CalendarSnapshot {
  captured_at: string;
  start_at: string;
  end_at: string;
  timezone: string;
  complete: boolean;
  events: CalendarEventSnapshot[];
  snapshot_hash: string;
}

export interface ImpactAssessment {
  event_ref: string;
  event_title: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  rule_id: string;
  reason: string;
  conflict_window: { start_at: string; end_at: string };
}

interface BaseAction {
  action_id: string;
  idempotency_key: string;
  required: boolean;
}

export interface ArtifactAction extends BaseAction {
  type: "ARTIFACT_UPSERT";
  title: string;
  sections: Array<{ key: string; heading: string; body_text: string }>;
  artifact_ref?: string;
  expected_version?: string;
}

export interface CalendarAction extends BaseAction {
  type: "CALENDAR_HOLD_UPSERT" | "CALENDAR_LINK_BRIEF";
  event_ref?: string;
  expected_version?: string;
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  timezone: string;
}

export interface MailAction extends BaseAction {
  type: "MAIL_SEND";
  thread_ref?: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body_text: string;
}

export type PlannedAction = ArtifactAction | CalendarAction | MailAction;

export interface ActionManifest {
  schema_version: "1.0";
  case_id: string;
  case_version: number;
  plan_id: string;
  actions: PlannedAction[];
  manifest_hash: string;
}

export interface RecoveryPlan {
  plan_id: string;
  version: number;
  strategy: "REMOTE_FIRST" | "NOTIFY_ONLY" | "ESCALATE";
  title: string;
  summary: string;
  rank: number;
  assumptions: string[];
  rationale: string[];
  manifest: ActionManifest;
  plan_hash: string;
}

export interface ApprovalGrant {
  schema_version: "1.0";
  approval_id: string;
  actor_id: string;
  case_id: string;
  case_version: number;
  plan_id: string;
  plan_hash: string;
  manifest_hash: string;
  source_snapshot_hash: string;
  calendar_snapshot_hash: string;
  issued_at: string;
  expires_at: string;
  nonce: string;
  consumed_at?: string;
}

export type ProviderErrorCategory =
  | "AUTH"
  | "PERMISSION"
  | "RATE_LIMIT"
  | "CONFLICT"
  | "VALIDATION"
  | "TRANSIENT"
  | "PERMANENT"
  | "UNKNOWN_OUTCOME";

export interface ProviderWriteResult {
  outcome: "SUCCEEDED";
  provider_ref: string;
  provider_version: string;
  verified: boolean;
  before_hash: string | null;
  after_hash: string;
  completed_at: string;
}

export interface ProviderError {
  category: ProviderErrorCategory;
  provider_code?: string;
  retryable: boolean;
  safe_message: string;
  redacted_details?: Record<string, unknown>;
}

export interface ExecutionReceipt {
  schema_version: "1.0";
  trace_id: string;
  case_id: string;
  action_id: string;
  plan_hash: string;
  connector: "GMAIL" | "CALENDAR" | "ARTIFACT";
  operation: string;
  idempotency_key: string;
  attempt: number;
  status: "PLANNED" | "STARTED" | "SUCCEEDED" | "FAILED" | "UNKNOWN" | "SKIPPED" | "COMPENSATED";
  request_fingerprint: string;
  provider_ref?: string;
  provider_version?: string;
  verified?: boolean;
  before_hash?: string | null;
  after_hash?: string | null;
  started_at: string;
  completed_at?: string;
  latency_ms?: number;
  evidence_refs: string[];
  error?: ProviderError;
}

export interface RecoveryCase {
  schema_version: "1.0";
  case_id: string;
  version: number;
  status: CaseState;
  source: SourceMessage;
  source_snapshot_hash: string;
  facts?: DisruptionFacts;
  calendar_snapshot?: CalendarSnapshot;
  impacts: ImpactAssessment[];
  plans: RecoveryPlan[];
  selected_plan_id?: string;
  approval?: ApprovalGrant;
  created_at: string;
  updated_at: string;
}

export interface WriteContext {
  schema_version: "1.0";
  trace_id: string;
  case_id: string;
  case_version: number;
  plan_id: string;
  plan_hash: string;
  action_id: string;
  idempotency_key: string;
  expected_snapshot_hash: string;
  dry_run: boolean;
}
