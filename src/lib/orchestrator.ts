import { randomBytes, randomUUID } from "node:crypto";
import { getServerConfig, assertRealProviderConfig } from "./config";
import { AdapterError, DomainError } from "./domain/errors";
import { hash } from "./domain/hash";
import { assessImpacts } from "./domain/impact";
import { deterministicExtract, modelExtract } from "./domain/extractor";
import { planRecovery } from "./domain/planner";
import { transition } from "./domain/state-machine";
import type {
  ApprovalGrant,
  ExecutionReceipt,
  PlannedAction,
  RecoveryCase,
  RecoveryPlan,
  WriteContext,
} from "./domain/types";
import { DEMO_MESSAGES } from "./fixtures";
import { DurableStore } from "./persistence";
import type { ProviderPorts } from "./ports";
import { FakeProviders } from "./adapters/fake";
import { GoogleCalendarAdapter, GoogleMailAdapter } from "./adapters/google";
import { NotionArtifactAdapter } from "./adapters/notion";

const APPROVAL_TTL_MS = 15 * 60 * 1000;
const CONFIDENCE_THRESHOLD = 0.8;

function now(): string {
  return new Date().toISOString();
}

function connector(action: PlannedAction): ExecutionReceipt["connector"] {
  return action.type === "ARTIFACT_UPSERT" || action.type === "NOTION_TRACKER_UPSERT" ? "ARTIFACT" : action.type === "MAIL_SEND" ? "GMAIL" : "CALENDAR";
}

export function providerPorts(): ProviderPorts {
  const config = getServerConfig();
  if (config.PROVIDER_MODE !== "real") return singletonFake;
  assertRealProviderConfig(config);
  const mail = new GoogleMailAdapter(config);
  const calendar = new GoogleCalendarAdapter(config);
  return { mail_reader: mail, mail_writer: mail, calendar_reader: calendar, calendar_writer: calendar, artifact_writer: new NotionArtifactAdapter(config) };
}

const singletonFake = new FakeProviders();
export const store = new DurableStore();

export function newDemoCase(scenario: keyof typeof DEMO_MESSAGES = "cancellation"): RecoveryCase {
  const created_at = now();
  const source = structuredClone(DEMO_MESSAGES[scenario]);
  return {
    schema_version: "1.0",
    case_id: "demo",
    version: 1,
    status: "INGESTED",
    source,
    source_snapshot_hash: hash({ source_version: source.source_version, content_hash: source.content_hash }),
    impacts: [],
    plans: [],
    created_at,
    updated_at: created_at,
  };
}

export async function ensureDemoCase(): Promise<RecoveryCase> {
  const existing = await store.getCase("demo");
  const config = getServerConfig();
  if (existing && !(config.PROVIDER_MODE === "real" && existing.source.message_id.startsWith("demo-"))) return existing;
  if (config.PROVIDER_MODE === "real") return resetDemoFromInbox();
  const item = newDemoCase();
  await store.replaceDemo(item);
  return item;
}

export async function resetDemoFromInbox(): Promise<RecoveryCase> {
  const config = getServerConfig();
  if (config.PROVIDER_MODE !== "real") return resetDemoCase("cancellation");
  const portSet = providerPorts();
  const scanned = await portSet.mail_reader.scan({ label: config.GMAIL_INGEST_LABEL, limit: 1 });
  const messageId = scanned.message_ids[0];
  if (!messageId) throw new DomainError(`No message was found under the configured demo Gmail label.`, "NOT_FOUND");
  const source = await portSet.mail_reader.get_message({ message_id: messageId });
  const created_at = now();
  const item: RecoveryCase = {
    schema_version: "1.0", case_id: "demo", version: 1, status: "INGESTED", source,
    source_snapshot_hash: hash({ source_version: source.source_version, content_hash: source.content_hash }),
    impacts: [], plans: [], created_at, updated_at: created_at,
  };
  await store.replaceDemo(item);
  return item;
}

export async function resetDemoCase(scenario: keyof typeof DEMO_MESSAGES = "cancellation"): Promise<RecoveryCase> {
  const item = newDemoCase(scenario);
  await store.replaceDemo(item);
  return item;
}

export async function analyzeCase(caseId: string, forceFallback = false): Promise<RecoveryCase> {
  let item = await store.getCase(caseId);
  if (!item) throw new DomainError("Case not found.", "NOT_FOUND");
  if (!["INGESTED", "NEEDS_CLARIFICATION"].includes(item.status)) {
    if (["READY_FOR_REVIEW", "APPROVED", "EXECUTING", "COMPLETED", "PARTIALLY_COMPLETED"].includes(item.status)) return item;
    throw new DomainError("This case cannot be analyzed in its current state.", "INVALID_STATE");
  }
  const expected = item.version;
  item = transition(item, "ANALYZING", now());
  await store.saveCase(item, expected);
  const config = getServerConfig();
  const facts = forceFallback ? deterministicExtract(item.source) : await modelExtract(item.source, config.OPENAI_API_KEY, config.OPENAI_MODEL);
  if (facts.case_confidence < CONFIDENCE_THRESHOLD || !facts.segments.some((segment) => segment.revised_end_at ?? segment.scheduled_end_at)) {
    const analyzingVersion = item.version;
    item = transition({ ...item, facts, impacts: [], plans: [] }, "NEEDS_CLARIFICATION", now());
    return store.saveCase(item, analyzingVersion);
  }
  const arrival = facts.segments.map((segment) => segment.revised_end_at ?? segment.scheduled_end_at).filter((value): value is string => Boolean(value)).sort().at(-1)!;
  const calendar = await providerPorts().calendar_reader.snapshot({
    start_at: new Date(Date.parse(arrival) - 12 * 60 * 60 * 1000).toISOString(),
    end_at: new Date(Date.parse(arrival) + 36 * 60 * 60 * 1000).toISOString(),
    timezone: "America/Los_Angeles",
  });
  if (!calendar.complete) throw new DomainError("The calendar snapshot is incomplete and cannot be approved.", "PROVIDER_FAILURE");
  const impacts = assessImpacts(facts, calendar);
  const withAnalysis: RecoveryCase = { ...item, facts, calendar_snapshot: calendar, impacts };
  const recipients = config.PROVIDER_MODE === "real" ? config.stakeholder_emails : ["stakeholder1@example.com", "stakeholder2@example.com"];
  const plans = planRecovery(withAnalysis, recipients);
  const analyzingVersion = item.version;
  item = transition({ ...withAnalysis, plans }, "READY_FOR_REVIEW", now());
  return store.saveCase(item, analyzingVersion);
}

function selectedPlan(item: RecoveryCase, planId?: string): RecoveryPlan {
  const plan = item.plans.find((candidate) => candidate.plan_id === (planId ?? item.selected_plan_id));
  if (!plan) throw new DomainError("Select a plan that belongs to this case.", "INVALID_REQUEST");
  return plan;
}

export async function approveCase(caseId: string, planId: string, _untrustedActorId?: string, expectedVersion?: number): Promise<RecoveryCase> {
  let item = await store.getCase(caseId);
  if (!item) throw new DomainError("Case not found.", "NOT_FOUND");
  if (item.status !== "READY_FOR_REVIEW") throw new DomainError("Only a reviewed plan can be approved.", "INVALID_STATE");
  if (expectedVersion !== undefined && item.version !== expectedVersion) throw new DomainError("The case changed after it was displayed.", "STALE_APPROVAL");
  const plan = selectedPlan(item, planId);
  const config = getServerConfig();
  const before = item.version;
  item = transition({ ...item, selected_plan_id: plan.plan_id }, "APPROVED", now());
  const issued = new Date();
  const approval: ApprovalGrant = {
    schema_version: "1.0",
    approval_id: randomUUID(),
    actor_id: config.PROVIDER_MODE === "real" ? config.RIPPLE_OPERATOR_EMAIL : "operator@example.com",
    case_id: item.case_id,
    case_version: item.version,
    plan_id: plan.plan_id,
    plan_hash: plan.plan_hash,
    manifest_hash: plan.manifest.manifest_hash,
    source_snapshot_hash: item.source_snapshot_hash,
    calendar_snapshot_hash: item.calendar_snapshot!.snapshot_hash,
    issued_at: issued.toISOString(),
    expires_at: new Date(issued.getTime() + APPROVAL_TTL_MS).toISOString(),
    nonce: randomBytes(16).toString("hex"),
  };
  return store.saveCase({ ...item, approval }, before);
}

async function validateApproval(item: RecoveryCase, portSet: ProviderPorts): Promise<void> {
  const approval = item.approval;
  const plan = selectedPlan(item);
  const { manifest_hash: declaredManifestHash, ...unsignedManifest } = plan.manifest;
  const { plan_hash: declaredPlanHash, ...unsignedPlan } = plan;
  if (hash(unsignedManifest) !== declaredManifestHash || hash(unsignedPlan) !== declaredPlanHash) {
    throw new DomainError("The approved plan content failed integrity verification.", "STALE_APPROVAL");
  }
  if (!approval || approval.case_version !== item.version || approval.plan_hash !== plan.plan_hash || approval.manifest_hash !== plan.manifest.manifest_hash) {
    throw new DomainError("Approval does not match the current plan.", "STALE_APPROVAL");
  }
  if (Date.parse(approval.expires_at) <= Date.now()) throw new DomainError("Approval expired; review the case again.", "STALE_APPROVAL");
  if (approval.source_snapshot_hash !== item.source_snapshot_hash || approval.calendar_snapshot_hash !== item.calendar_snapshot?.snapshot_hash) {
    throw new DomainError("A bound snapshot changed after review.", "STALE_APPROVAL");
  }
  if (getServerConfig().PROVIDER_MODE === "real") {
    const freshSource = await portSet.mail_reader.get_message({ message_id: item.source.message_id });
    if (freshSource.content_hash !== item.source.content_hash) throw new DomainError("The source email changed after review.", "STALE_APPROVAL");
    const snapshot = await portSet.calendar_reader.snapshot({ start_at: item.calendar_snapshot.start_at, end_at: item.calendar_snapshot.end_at, timezone: item.calendar_snapshot.timezone });
    if (snapshot.snapshot_hash !== item.calendar_snapshot.snapshot_hash) throw new DomainError("The calendar changed after review; re-analysis is required.", "STALE_APPROVAL");
  }
}

function assertSafeToResume(item: RecoveryCase, receipts: ExecutionReceipt[]): void {
  if (!item.approval?.consumed_at) {
    throw new DomainError("The execution journal is missing its consumed approval.", "INVALID_STATE");
  }
  const blockingReceipt = receipts.find((receipt) =>
    receipt.status === "STARTED" || receipt.status === "UNKNOWN" || (receipt.status === "FAILED" && receipt.error?.retryable !== true),
  );
  if (blockingReceipt) {
    throw new DomainError(
      "An external action has an uncertain or non-retryable outcome and requires manual reconciliation.",
      "INVALID_STATE",
    );
  }
}

export async function executeCase(caseId: string): Promise<RecoveryCase> {
  let item = await store.getCase(caseId);
  if (!item) throw new DomainError("Case not found.", "NOT_FOUND");
  const portSet = providerPorts();
  const priorReceipts = await store.listReceipts(item.case_id);
  if (item.status === "APPROVED") await validateApproval(item, portSet);
  else if (["EXECUTING", "PARTIALLY_COMPLETED"].includes(item.status)) assertSafeToResume(item, priorReceipts);
  else throw new DomainError("The case is not approved for execution.", "INVALID_STATE");
  const plan = selectedPlan(item);
  const caseSnapshot = item;
  const plannedAt = now();
  await store.planReceipts(plan.manifest.actions.map((action) => ({
    schema_version: "1.0" as const, trace_id: randomUUID(), case_id: caseSnapshot.case_id, action_id: action.action_id,
    plan_hash: plan.plan_hash, connector: connector(action), operation: action.type, idempotency_key: action.idempotency_key,
    attempt: 1, status: "PLANNED" as const, request_fingerprint: hash(action), started_at: plannedAt, evidence_refs: [caseSnapshot.source.message_id],
  })));
  if (item.status !== "EXECUTING") {
    const before = item.version;
    item = transition(item, "EXECUTING", now());
    if (item.approval && !item.approval.consumed_at) item = { ...item, approval: { ...item.approval, consumed_at: now() } };
    await store.saveCase(item, before);
  }

  for (const action of plan.manifest.actions) {
    const existing = (await store.listReceipts(item.case_id)).find((receipt) => receipt.action_id === action.action_id);
    if (existing?.status === "SUCCEEDED") continue;
    if (existing?.status === "STARTED" || existing?.status === "UNKNOWN" || (existing?.status === "FAILED" && existing.error?.retryable !== true)) {
      throw new DomainError("This action requires manual reconciliation before it can continue.", "INVALID_STATE");
    }
    const started = new Date();
    const traceId = existing?.trace_id ?? randomUUID();
    const receipt: ExecutionReceipt = {
      schema_version: "1.0", trace_id: traceId, case_id: item.case_id, action_id: action.action_id,
      plan_hash: plan.plan_hash, connector: connector(action), operation: action.type,
      idempotency_key: action.idempotency_key, attempt: existing?.status === "PLANNED" ? 1 : (existing?.attempt ?? 0) + 1, status: "STARTED",
      request_fingerprint: hash(action), started_at: started.toISOString(), evidence_refs: [item.source.message_id],
    };
    await store.upsertReceipt(receipt);
    const context: WriteContext = {
      schema_version: "1.0", trace_id: traceId, case_id: item.case_id, case_version: item.version,
      plan_id: plan.plan_id, plan_hash: plan.plan_hash, action_id: action.action_id,
      idempotency_key: action.idempotency_key, expected_snapshot_hash: item.calendar_snapshot!.snapshot_hash, dry_run: false,
    };
    try {
      const result = action.type === "ARTIFACT_UPSERT"
        ? await portSet.artifact_writer.upsert_case_brief(context, action)
        : action.type === "NOTION_TRACKER_UPSERT"
          ? await portSet.artifact_writer.upsert_tracker(context, action)
        : action.type === "MAIL_SEND"
          ? await portSet.mail_writer.send(context, action)
          : await portSet.calendar_writer.apply(context, action);
      if (!result.verified) {
        throw new AdapterError({ category: "UNKNOWN_OUTCOME", retryable: false, safe_message: "The provider write could not be verified and requires manual reconciliation." });
      }
      await store.upsertReceipt({ ...receipt, status: "SUCCEEDED", provider_ref: result.provider_ref, provider_version: result.provider_version, external_url: result.external_url, verified: result.verified, before_hash: result.before_hash, after_hash: result.after_hash, completed_at: result.completed_at, latency_ms: Date.now() - started.getTime() });
    } catch (error) {
      const detail = error instanceof AdapterError ? error.detail : { category: "PERMANENT" as const, retryable: false, safe_message: "An unexpected provider failure occurred." };
      await store.upsertReceipt({ ...receipt, status: detail.category === "UNKNOWN_OUTCOME" ? "UNKNOWN" : "FAILED", error: detail, completed_at: now(), latency_ms: Date.now() - started.getTime() });
      const current = (await store.getCase(caseId))!;
      item = transition(current, "PARTIALLY_COMPLETED", now());
      return store.saveCase(item, current.version);
    }
  }
  const current = (await store.getCase(caseId))!;
  item = transition(current, "COMPLETED", now());
  return store.saveCase(item, current.version);
}

export async function replayCompletedCase(caseId: string): Promise<{ new_actions: number; reused_actions: number; reused_provider_refs: string[] }> {
  const item = await store.getCase(caseId);
  if (!item) throw new DomainError("Case not found.", "NOT_FOUND");
  if (item.status !== "COMPLETED") throw new DomainError("Complete the approved plan before replaying it.", "INVALID_STATE");
  const plan = selectedPlan(item);
  const receipts = await store.listReceipts(caseId);
  const reused = plan.manifest.actions.map((action) => receipts.find((receipt) => receipt.action_id === action.action_id && receipt.status === "SUCCEEDED")).filter((receipt): receipt is ExecutionReceipt => Boolean(receipt));
  return { new_actions: plan.manifest.actions.length - reused.length, reused_actions: reused.length, reused_provider_refs: reused.map((receipt) => receipt.provider_ref).filter((ref): ref is string => Boolean(ref)) };
}
