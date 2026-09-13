import { z } from "zod";

export const V2_SCHEMA_VERSION = "2.0" as const;

export const connectionProviderSchema = z.enum(["gmail", "calendar", "notion"]);
export const connectionStatusSchema = z.enum(["not_started", "verifying", "verified", "needs_attention"]);
export const verificationModeSchema = z.enum(["real", "fixture"]);

export const connectionCapabilitySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  verified: z.boolean(),
}).strict();

export const connectionSummarySchema = z.object({
  schema_version: z.literal(V2_SCHEMA_VERSION),
  provider: connectionProviderSchema,
  status: connectionStatusSchema,
  verification_mode: verificationModeSchema,
  display_name: z.string().min(1).optional(),
  masked_identity: z.string().min(1).optional(),
  destination_label: z.string().min(1).optional(),
  capabilities: z.array(connectionCapabilitySchema),
  checked_at: z.string().datetime().optional(),
  valid_until: z.string().datetime().optional(),
  safe_error: z.string().min(1).optional(),
}).strict().superRefine((value, context) => {
  if (value.status === "verified") {
    if (!value.checked_at || !value.valid_until) context.addIssue({ code: z.ZodIssueCode.custom, message: "Verified connections require a validity window." });
    if (!value.capabilities.length || value.capabilities.some((capability) => !capability.verified)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Verified connections require verified capabilities." });
  }
  if (value.status === "needs_attention" && !value.safe_error) context.addIssue({ code: z.ZodIssueCode.custom, message: "Connections needing attention require a safe explanation." });
});

export const onboardingStepSchema = z.enum(["account", "gmail", "calendar", "notion", "complete", "workspace"]);

export const onboardingProfileSchema = z.object({
  schema_version: z.literal(V2_SCHEMA_VERSION),
  session_id: z.string().uuid(),
  version: z.number().int().positive(),
  current_step: onboardingStepSchema,
  completed: z.boolean(),
  account: z.object({ display_name: z.string().min(1).max(80) }).strict().optional(),
  connections: z.object({
    gmail: connectionSummarySchema,
    calendar: connectionSummarySchema,
    notion: connectionSummarySchema,
  }).strict(),
  selected_calendar_token: z.string().min(1).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).strict().superRefine((value, context) => {
  for (const provider of connectionProviderSchema.options) {
    if (value.connections[provider].provider !== provider) context.addIssue({ code: z.ZodIssueCode.custom, path: ["connections", provider, "provider"], message: "Connection provider does not match its key." });
  }
  if (value.completed && (value.current_step !== "workspace" || !value.account || Object.values(value.connections).some((connection) => connection.status !== "verified"))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Completed onboarding requires an account, verified connections, and workspace step." });
  }
});

export const calendarOptionSchema = z.object({
  selection_token: z.string().min(1),
  display_name: z.string().min(1),
  primary: z.boolean(),
  writable: z.boolean(),
}).strict();

export const calendarOptionsResponseSchema = z.object({
  schema_version: z.literal(V2_SCHEMA_VERSION),
  options: z.array(calendarOptionSchema),
}).strict();

export const accountRequestSchema = z.object({ display_name: z.string().trim().min(1).max(80) }).strict();
export const calendarSelectionRequestSchema = z.object({ selection_token: z.string().min(1) }).strict();

export const schedulingIntentSchema = z.enum(["PREPARE_WEEK", "FIND_TIME", "REVIEW_RECENT_CHANGES", "PROTECT_TIME", "UNKNOWN"]);
export const proposalStateSchema = z.enum(["DRAFT", "READY_FOR_REVIEW", "APPROVED", "INVALIDATED", "EXECUTING", "COMPLETED", "PARTIALLY_COMPLETED", "NEEDS_MANUAL_REVIEW", "REJECTED"]);

export const candidateBlockSchema = z.object({
  title: z.string().min(1),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  timezone: z.string().min(1),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.end_at) <= Date.parse(value.start_at)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Candidate block must end after it starts." });
  try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }).format(); }
  catch { context.addIssue({ code: z.ZodIssueCode.custom, message: "Candidate block timezone is invalid." }); }
});

export const proposalAlternativeSchema = z.object({
  alternative_id: z.string().uuid(),
  title: z.string().min(1),
  summary: z.string().min(1),
  tradeoffs: z.array(z.string().min(1)),
  recommended: z.boolean(),
  candidate_block: candidateBlockSchema.optional(),
}).strict();

const proposalTargetSchema = z.object({
  event_ref: z.string().min(1),
  source_calendar: z.enum(["PRIMARY", "SELECTED"]),
  title: z.string().min(1),
  organizer_email: z.string().email().optional(),
  owned_by_operator: z.boolean().default(false),
  provider_version: z.string().min(1).optional(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (!value.owned_by_operator && !value.organizer_email) context.addIssue({ code: z.ZodIssueCode.custom, message: "A non-owned meeting requires its organizer." });
});

const labeledEmailActionSchema = z.object({
  message_ref: z.string().min(1),
  sender_email: z.string().email(),
  subject: z.string().min(1),
  kind: z.enum(["MEETING_REQUEST", "DEADLINE", "COMMITMENT", "RESCHEDULE", "CANCELLATION", "FYI"]),
  title: z.string().min(1),
  duration_minutes: z.number().int().min(15).max(240).nullable(),
  constraints_summary: z.string().min(1),
  importance: z.enum(["HIGH", "MEDIUM", "LOW"]),
}).strict();

export const followThroughTaskSchema = z.object({
  task_id: z.string().min(1), title: z.string().min(1), owner_label: z.string().min(1),
  owner_email: z.string().email().optional(), due_at: z.string().datetime().optional(), timezone: z.string().optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"]), source_action_id: z.string().min(1),
}).strict();

const baseActionFields = { action_id: z.string().min(1), idempotency_key: z.string().min(1), required: z.boolean() };
export const v2PlannedActionSchema = z.discriminatedUnion("type", [
  z.object({ ...baseActionFields, type: z.literal("NOTION_TRACKER_UPSERT"), title: z.string().min(1), executive_summary: z.string().min(1), decision_at: z.string().datetime(), status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED", "BLOCKED"]), chosen_decision: z.string().min(1), impact: z.string().min(1), next_deadline: z.string().datetime().optional(), last_updated_at: z.string().datetime(), affected_commitments: z.array(z.object({ title: z.string().min(1), time_label: z.string().min(1), owner_label: z.string().min(1), impact: z.string().min(1), chosen_response: z.string().min(1) }).strict()), decisions: z.array(z.object({ decision: z.string().min(1), decided_at: z.string().datetime() }).strict()).min(1), tasks: z.array(followThroughTaskSchema).min(1) }).strict(),
  z.object({ ...baseActionFields, type: z.literal("CALENDAR_HOLD_UPSERT"), title: z.string().min(1), description: z.string().optional(), start_at: z.string().datetime(), end_at: z.string().datetime(), timezone: z.string().min(1), proposal_for: z.object({ event_ref: z.string().min(1), source_calendar: z.enum(["PRIMARY", "SELECTED"]), original_title: z.string().min(1), organizer_email: z.string().email() }).strict().optional(), reschedule_owned: z.object({ event_ref: z.string().min(1), source_calendar: z.enum(["PRIMARY", "SELECTED"]), original_title: z.string().min(1), expected_version: z.string().min(1) }).strict().optional(), email_request: z.object({ message_ref: z.string().min(1), sender_email: z.string().email(), subject: z.string().min(1) }).strict().optional() }).strict(),
  z.object({ ...baseActionFields, type: z.literal("MAIL_SEND"), to: z.array(z.string().email()).min(1), cc: z.array(z.string().email()), bcc: z.array(z.string().email()).max(0), subject: z.string().min(1), body_text: z.string().min(1) }).strict(),
]);
export const v2ActionManifestSchema = z.object({
  schema_version: z.literal("1.0"), case_id: z.string().min(1), case_version: z.number().int().positive(), plan_id: z.string().min(1),
  actions: z.array(v2PlannedActionSchema).min(1), manifest_hash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((value, context) => {
  const rank: Record<string, number> = { NOTION_TRACKER_UPSERT: 0, CALENDAR_HOLD_UPSERT: 1, MAIL_SEND: 2 };
  if (value.actions.some((action, index) => index > 0 && rank[action.type] < rank[value.actions[index - 1].type])) context.addIssue({ code: z.ZodIssueCode.custom, message: "Actions must be ordered Notion, Calendar, then Gmail." });
  if (new Set(value.actions.map((action) => action.type)).size !== value.actions.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "A manifest may contain at most one action per provider operation." });
  for (const action of value.actions) if (action.type === "CALENDAR_HOLD_UPSERT") {
    if (Date.parse(action.end_at) <= Date.parse(action.start_at)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Calendar action must end after it starts." });
    try { new Intl.DateTimeFormat("en", { timeZone: action.timezone }).format(); }
    catch { context.addIssue({ code: z.ZodIssueCode.custom, message: "Calendar action timezone is invalid." }); }
    if (action.proposal_for && action.reschedule_owned) context.addIssue({ code: z.ZodIssueCode.custom, message: "A Calendar action cannot both move an owned event and propose a time to another organizer." });
  }
});

const schedulingProposalPublicShape = {
  schema_version: z.literal(V2_SCHEMA_VERSION),
  proposal_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  version: z.number().int().positive(),
  status: proposalStateSchema,
  intent: schedulingIntentSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  assumptions: z.array(z.string().min(1)),
  insights: z.array(z.object({ kind: z.enum(["CONFLICT", "TIGHT_TRANSITION", "MISSING_PREP", "OPEN_WINDOW", "RECENT_CHANGE", "INFORMATION"]), title: z.string().min(1), detail: z.string().min(1), event_refs: z.array(z.string()) }).strict()),
  alternatives: z.array(proposalAlternativeSchema).max(3),
  target_event: proposalTargetSchema.optional(),
  labeled_email_action: labeledEmailActionSchema.optional(),
  selected_alternative_id: z.string().uuid().optional(),
  manifest: v2ActionManifestSchema.optional(),
  calendar_snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/),
  calendar_window: z.object({ start_at: z.string().datetime(), end_at: z.string().datetime(), timezone: z.string().min(1) }).strict(),
  source_context_hash: z.string().regex(/^[a-f0-9]{64}$/),
  proposal_hash: z.string().regex(/^[a-f0-9]{64}$/),
  expires_at: z.string().datetime(),
};
function validateProposalState(value: z.infer<z.ZodObject<typeof schedulingProposalPublicShape>>, context: z.RefinementCtx) {
  if (value.status === "DRAFT" && (value.selected_alternative_id || value.manifest)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Draft proposals cannot contain an executable selection." });
  if (["READY_FOR_REVIEW", "APPROVED", "EXECUTING", "COMPLETED", "PARTIALLY_COMPLETED", "NEEDS_MANUAL_REVIEW"].includes(value.status) && (!value.selected_alternative_id || !value.manifest)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Actionable proposal states require an exact selected manifest." });
  if (value.selected_alternative_id && !value.alternatives.some((item) => item.alternative_id === value.selected_alternative_id)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Selected alternative must belong to the proposal." });
}
export const schedulingProposalSchema = z.object({ ...schedulingProposalPublicShape, user_id: z.string().uuid() }).strict().superRefine(validateProposalState);

export const conversationSchema = z.object({
  schema_version: z.literal(V2_SCHEMA_VERSION),
  conversation_id: z.string().uuid(),
  user_id: z.string().uuid(),
  version: z.number().int().positive(),
  status: z.enum(["ACTIVE", "ARCHIVED"]),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).strict();

export const conversationMessageSchema = z.object({
  schema_version: z.literal(V2_SCHEMA_VERSION),
  message_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  role: z.enum(["USER", "ASSISTANT", "SYSTEM_EVENT"]),
  content: z.string().min(1).max(4000),
  created_at: z.string().datetime(),
  proposal_id: z.string().uuid().optional(),
}).strict();

export const conversationViewSchema = z.object({
  schema_version: z.literal(V2_SCHEMA_VERSION),
  conversation: conversationSchema,
  messages: z.array(conversationMessageSchema),
  proposals: z.array(schedulingProposalSchema),
}).strict();

export const createConversationRequestSchema = z.object({ starter: z.enum(["PREPARE_WEEK", "FIND_TIME", "REVIEW_RECENT_CHANGES"]).optional() }).strict();
export const sendConversationMessageRequestSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  intent: schedulingIntentSchema.optional(),
  timezone: z.string().min(1).max(100).default("Europe/Berlin"),
  supersedes_proposal_id: z.string().uuid().optional(),
}).strict();
export const selectProposalRequestSchema = z.object({ expected_version: z.number().int().positive(), alternative_id: z.string().uuid() }).strict();
export const rejectProposalRequestSchema = z.object({ expected_version: z.number().int().positive() }).strict();
export const confirmProposalRequestSchema = z.object({ expected_version: z.number().int().positive(), proposal_hash: z.string().regex(/^[a-f0-9]{64}$/), manifest_hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const publicReceiptSchema = z.object({ action_id: z.string(), connector: z.enum(["GMAIL", "CALENDAR", "ARTIFACT"]), operation: z.string(), status: z.enum(["PLANNED", "STARTED", "SUCCEEDED", "FAILED", "UNKNOWN", "SKIPPED", "COMPENSATED"]), verified: z.boolean().optional(), external_url: z.string().url().optional(), safe_error: z.string().optional() }).strict();
export const proposalExecutionResponseSchema = z.object({ view: z.lazy(() => publicConversationViewSchema), receipts: z.array(publicReceiptSchema) }).strict();

export type ConnectionProvider = z.infer<typeof connectionProviderSchema>;
export type ConnectionSummary = z.infer<typeof connectionSummarySchema>;
export type OnboardingProfile = z.infer<typeof onboardingProfileSchema>;
export type OnboardingStep = z.infer<typeof onboardingStepSchema>;
export type CalendarOption = z.infer<typeof calendarOptionSchema>;
export type SchedulingIntent = z.infer<typeof schedulingIntentSchema>;
export type SchedulingProposal = z.infer<typeof schedulingProposalSchema>;
export type ProposalAlternative = z.infer<typeof proposalAlternativeSchema>;
export type V2ActionManifest = z.infer<typeof v2ActionManifestSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type ConversationView = z.infer<typeof conversationViewSchema>;

export const onboardingProfileViewSchema = z.object({
  schema_version: z.literal(V2_SCHEMA_VERSION),
  version: z.number().int().positive(),
  current_step: onboardingStepSchema,
  completed: z.boolean(),
  account: z.object({ display_name: z.string().min(1).max(80) }).strict().optional(),
  connections: z.object({ gmail: connectionSummarySchema, calendar: connectionSummarySchema, notion: connectionSummarySchema }).strict(),
  selected_calendar_token: z.string().min(1).optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).strict();

export const publicConversationSchema = conversationSchema.omit({ user_id: true });
export const publicSchedulingProposalSchema = z.object(schedulingProposalPublicShape).strict().superRefine(validateProposalState);
export const publicConversationViewSchema = z.object({
  schema_version: z.literal(V2_SCHEMA_VERSION),
  conversation: publicConversationSchema,
  messages: z.array(conversationMessageSchema),
  proposals: z.array(publicSchedulingProposalSchema),
}).strict();

export type OnboardingProfileView = z.infer<typeof onboardingProfileViewSchema>;
export type PublicConversationView = z.infer<typeof publicConversationViewSchema>;
export type PublicReceipt = z.infer<typeof publicReceiptSchema>;
export type ProposalExecutionResponse = z.infer<typeof proposalExecutionResponseSchema>;

export function publicOnboardingProfile(profile: OnboardingProfile): OnboardingProfileView {
  const { session_id: _, ...view } = profile;
  return onboardingProfileViewSchema.parse(view);
}

export function publicConversationView(view: ConversationView): PublicConversationView {
  const { user_id: _conversationUser, ...conversation } = view.conversation;
  return publicConversationViewSchema.parse({
    schema_version: view.schema_version,
    conversation,
    messages: view.messages,
    proposals: view.proposals.map(({ user_id: _proposalUser, ...proposal }) => proposal),
  });
}

export interface VerifiedConnection {
  display_name?: string;
  identity?: string;
  destination_label?: string;
  capabilities: Array<{ key: string; label: string; verified: boolean }>;
}

export interface InternalCalendarOption extends CalendarOption {
  provider_calendar_id: string;
}

export interface ConnectionVerifierPort {
  readonly mode: "real" | "fixture";
  verifyGmail(): Promise<VerifiedConnection>;
  listCalendars(): Promise<InternalCalendarOption[]>;
  verifyCalendar(providerCalendarId: string): Promise<VerifiedConnection>;
  verifyNotion(): Promise<VerifiedConnection>;
}

export function blankConnection(provider: ConnectionProvider, mode: "real" | "fixture"): ConnectionSummary {
  return { schema_version: V2_SCHEMA_VERSION, provider, status: "not_started", verification_mode: mode, capabilities: [] };
}
