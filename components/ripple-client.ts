export type RiskTone = "critical" | "warning";
export type ActionStatus = "planned" | "running" | "verified" | "failed" | "unknown";

export type RippleAction = {
  id: string;
  provider: "Notion" | "Google Calendar" | "Gmail";
  shortProvider: "Notion" | "Calendar" | "Gmail";
  title: string;
  detail: string;
  preview: string[];
  status: ActionStatus;
  receipt?: string;
};

export type RippleCase = {
  caseId: string;
  caseVersion: number;
  mode: "Synthetic demo" | "Live test" | "Design fixture";
  status: "Ready for review" | "Needs clarification" | "Awaiting approval" | "Executing" | "Recovered" | "Partial failure";
  canApprove: boolean;
  sourceChecked: boolean;
  calendarChecked: boolean;
  route: { origin: string; destination: string; serviceNumber: string };
  headline: string;
  subhead: string;
  lastChecked: string;
  evidence: { label: string; value: string; previous: string; excerpt: string; timestamp: string };
  impacts: Array<{
    time: string;
    timezone: string;
    title: string;
    owner: string;
    tone: RiskTone;
    verdict: string;
    reason: string;
  }>;
  plans: Array<{
    id: string;
    name: string;
    recommended: boolean;
    rationale: string;
    resolves: string;
    leaves: string;
    actionCount: number;
    actions?: RippleAction[];
  }>;
  actions: RippleAction[];
};

export type BenchResult = {
  passed: number;
  total: number;
  scenarios: Array<{ id: string; name: string; passed: boolean }>;
};

export type RipplePayload = { case: RippleCase; bench: BenchResult | null; connected: boolean };

export const demoCase: RippleCase = {
  caseId: "rpl_demo_204",
  caseVersion: 4,
  mode: "Design fixture",
  status: "Ready for review",
  canApprove: false,
  sourceChecked: true,
  calendarChecked: true,
  route: { origin: "BER", destination: "SFO", serviceNumber: "LH 454" },
  headline: "Flight cancelled → 2 commitments at risk",
  subhead: "BER to SFO · Sunday, 13 September",
  lastChecked: "Checked moments ago",
  evidence: {
    label: "LH 454 · BER 08:10 → SFO 11:20",
    value: "Cancelled",
    previous: "Scheduled",
    excerpt: "We’re sorry—your flight LH 454 to San Francisco has been cancelled.",
    timestamp: "Gmail · received 07:12 CEST",
  },
  impacts: [
    {
      time: "14:00",
      timezone: "PDT",
      title: "Customer roadmap review",
      owner: "Hosted by stakeholder1@example.com",
      tone: "critical",
      verdict: "Impossible in person",
      reason: "The flight is cancelled, so the required arrival cannot be met.",
    },
    {
      time: "16:00",
      timezone: "PDT",
      title: "Partner workshop",
      owner: "With stakeholder2@example.com",
      tone: "warning",
      verdict: "20 min short of buffer",
      reason: "The recovery window leaves 40 minutes; your travel policy requires 60.",
    },
  ],
  plans: [
    {
      id: "remote-first",
      name: "Remote-first recovery",
      recommended: true,
      rationale: "Fastest way to protect both commitments without claiming a replacement flight.",
      resolves: "Customer communication and calendar visibility",
      leaves: "Replacement travel must be booked manually",
      actionCount: 3,
    },
    {
      id: "notify-only",
      name: "Notify and reassess",
      recommended: false,
      rationale: "Minimizes changes while travel options are still being considered.",
      resolves: "Immediate stakeholder expectations",
      leaves: "Calendar remains ambiguous; travel is still manual",
      actionCount: 2,
    },
  ],
  actions: [
    {
      id: "artifact-1",
      provider: "Notion",
      shortProvider: "Notion",
      title: "Create recovery brief",
      detail: "Ripple Demo Outputs / BER → SFO recovery",
      preview: ["Status and evidence", "Impact timeline", "Owners and next steps"],
      status: "planned",
    },
    {
      id: "calendar-1",
      provider: "Google Calendar",
      shortProvider: "Calendar",
      title: "Add travel disruption hold",
      detail: "Sun 13 Sep · 13:00–16:30 PDT",
      preview: ["Title: Travel disruption — BER → SFO", "Visibility: Private", "No existing meetings moved"],
      status: "planned",
    },
    {
      id: "mail-1",
      provider: "Gmail",
      shortProvider: "Gmail",
      title: "Notify 2 stakeholders",
      detail: "stakeholder1@example.com, stakeholder2@example.com",
      preview: ["Subject: Travel disruption — joining remotely", "CC: none · BCC: none", "I’ll join remotely while I arrange replacement travel."],
      status: "planned",
    },
  ],
};

type ServerAction = {
  action_id: string;
  type: string;
  title?: string;
  description?: string;
  start_at?: string;
  end_at?: string;
  timezone?: string;
  sections?: Array<{ heading: string; body_text: string }>;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body_text?: string;
};

type ServerReceipt = {
  action_id: string;
  connector: "GMAIL" | "CALENDAR" | "ARTIFACT";
  status: "PLANNED" | "STARTED" | "SUCCEEDED" | "FAILED" | "UNKNOWN" | "SKIPPED" | "COMPENSATED";
  verified?: boolean;
  completed_at?: string;
  provider_ref?: string;
};

type ServerCase = {
  case_id: string;
  version: number;
  status: string;
  updated_at: string;
  source: { subject: string; body_text: string; received_at: string };
  facts?: { kind: string; segments: Array<{ service_number?: string; origin?: string; destination?: string; scheduled_start_at?: string; revised_start_at?: string }> };
  calendar_snapshot?: { complete: boolean; events: Array<{ event_ref: string; title: string; organizer?: string; timezone: string }> };
  impacts: Array<{ event_ref: string; event_title: string; severity: "LOW" | "MEDIUM" | "HIGH"; reason: string; conflict_window: { start_at: string; end_at: string } }>;
  plans: Array<{ plan_id: string; title: string; summary: string; rank: number; rationale: string[]; assumptions: string[]; manifest: { actions: ServerAction[] } }>;
  selected_plan_id?: string;
};

type ServerCaseResponse = { case: ServerCase; receipts: ServerReceipt[]; provider_mode: "fake" | "real" };
type ServerBenchResponse = { passed: number; total: number; scenarios: Array<{ id: string; name: string; passed: boolean }> };
type ServerReplayResponse = ServerCaseResponse & {
  replay: { new_actions: number; reused_actions: number; reused_provider_refs: string[] };
};

const formatTime = (value?: string) => value ? new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Los_Angeles" }).format(new Date(value)) : "—";
const serverState = (status: string): RippleCase["status"] => status === "COMPLETED" ? "Recovered" : status === "EXECUTING" ? "Executing" : status === "PARTIALLY_COMPLETED" || status === "NEEDS_MANUAL_REVIEW" ? "Partial failure" : status === "APPROVED" ? "Awaiting approval" : status === "READY_FOR_REVIEW" ? "Ready for review" : "Needs clarification";

function actionStatus(actionId: string, receipts: ServerReceipt[]): ActionStatus {
  const receipt = [...receipts].reverse().find((item) => item.action_id === actionId);
  if (!receipt) return "planned";
  if (receipt.status === "SUCCEEDED" && receipt.verified) return "verified";
  if (receipt.status === "STARTED") return "running";
  if (receipt.status === "UNKNOWN") return "unknown";
  if (receipt.status === "FAILED") return "failed";
  return "planned";
}

function mapAction(action: ServerAction, receipts: ServerReceipt[]): RippleAction {
  const receipt = [...receipts].reverse().find((item) => item.action_id === action.action_id);
  if (action.type === "ARTIFACT_UPSERT") return {
    id: action.action_id, provider: "Notion", shortProvider: "Notion", title: action.title ?? "Create recovery brief",
    detail: action.sections?.map((section) => section.heading).join(" · ") || "Recovery brief",
    preview: action.sections?.map((section) => `${section.heading}: ${section.body_text}`) ?? [], status: actionStatus(action.action_id, receipts),
    receipt: receipt?.provider_ref,
  };
  if (action.type.startsWith("CALENDAR_")) return {
    id: action.action_id, provider: "Google Calendar", shortProvider: "Calendar", title: action.title ?? "Update recovery calendar",
    detail: `${formatTime(action.start_at)}–${formatTime(action.end_at)} · ${action.timezone ?? ""}`,
    preview: [action.description ?? "", "Existing third-party meetings remain unchanged"].filter(Boolean), status: actionStatus(action.action_id, receipts), receipt: receipt?.provider_ref,
  };
  return {
    id: action.action_id, provider: "Gmail", shortProvider: "Gmail", title: `Notify ${action.to?.length ?? 0} stakeholder${action.to?.length === 1 ? "" : "s"}`,
    detail: action.to?.join(", ") ?? "No recipients", preview: [`Subject: ${action.subject ?? ""}`, `CC: ${action.cc?.join(", ") || "none"} · BCC: ${action.bcc?.join(", ") || "none"}`, action.body_text ?? ""],
    status: actionStatus(action.action_id, receipts), receipt: receipt?.provider_ref,
  };
}

function mapServerCase(payload: ServerCaseResponse): RippleCase {
  const item = payload.case;
  const segment = item.facts?.segments[0];
  const selected = item.plans.find((plan) => plan.plan_id === item.selected_plan_id) ?? [...item.plans].sort((a, b) => a.rank - b.rank)[0];
  const eventByRef = new Map(item.calendar_snapshot?.events.map((event) => [event.event_ref, event]) ?? []);
  const disruption = item.facts?.kind === "CANCELLATION" ? "Flight cancelled" : item.facts?.kind === "DELAY" ? "Flight delayed" : "Travel changed";
  return {
    caseId: item.case_id, caseVersion: item.version, mode: payload.provider_mode === "real" ? "Live test" : "Synthetic demo", status: serverState(item.status), canApprove: item.status === "READY_FOR_REVIEW", sourceChecked: Boolean(item.source.subject), calendarChecked: item.calendar_snapshot?.complete === true,
    route: { origin: segment?.origin ?? "Origin unavailable", destination: segment?.destination ?? "Destination unavailable", serviceNumber: segment?.service_number ?? "Service unavailable" },
    headline: `${disruption} → ${item.impacts.length} commitments at risk`,
    subhead: `${segment?.origin ?? "BER"} to ${segment?.destination ?? "SFO"} · ${segment?.service_number ?? "Travel notice"}`,
    lastChecked: `Updated ${new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.updated_at))}`,
    evidence: { label: item.source.subject, value: disruption.replace("Flight ", ""), previous: "Scheduled", excerpt: item.source.body_text, timestamp: `Gmail · received ${new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.source.received_at))}` },
    impacts: item.impacts.map((impact) => ({ time: formatTime(impact.conflict_window.start_at), timezone: "PDT", title: impact.event_title, owner: eventByRef.get(impact.event_ref)?.organizer ? `Hosted by ${eventByRef.get(impact.event_ref)?.organizer}` : "Calendar commitment", tone: impact.severity === "HIGH" ? "critical" : "warning", verdict: impact.severity === "HIGH" ? "High impact" : "At risk", reason: impact.reason })),
    plans: [...item.plans].sort((a, b) => a.rank - b.rank).map((plan) => ({ id: plan.plan_id, name: plan.title, recommended: plan.rank === 1, rationale: plan.rationale.join(" ") || plan.summary, resolves: plan.summary, leaves: plan.assumptions.join(" ") || "No unresolved assumptions", actionCount: plan.manifest.actions.length, actions: plan.manifest.actions.map((action) => mapAction(action, payload.receipts)) })),
    actions: selected?.manifest.actions.map((action) => mapAction(action, payload.receipts)) ?? [],
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.safe_message ?? body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
}

export async function getRippleCase(): Promise<RipplePayload> {
  try {
    const [casePayload, bench] = await Promise.all([
      requestJson<ServerCaseResponse>("/api/cases/demo"),
      requestJson<ServerBenchResponse>("/api/bench").catch(() => null),
    ]);
    return { case: mapServerCase(casePayload), bench, connected: true };
  } catch {
    return { case: demoCase, bench: null, connected: false };
  }
}

export async function approveRippleCase(_caseId: string, planId: string, caseVersion: number): Promise<RippleCase> {
  const payload = await requestJson<ServerCaseResponse>("/api/cases/demo/approve", { method: "POST", body: JSON.stringify({ plan_id: planId, case_version: caseVersion, execute: true }) });
  return mapServerCase(payload);
}

export async function replayRippleCase(_caseId: string): Promise<{ case: RippleCase; newActions: number | null }> {
  const payload = await requestJson<ServerReplayResponse>("/api/cases/demo/replay", { method: "POST", body: "{}" });
  if (!("case" in payload)) throw new Error("Replay endpoint did not return provider-backed case results.");
  return { case: mapServerCase(payload), newActions: typeof payload.replay?.new_actions === "number" ? payload.replay.new_actions : null };
}
