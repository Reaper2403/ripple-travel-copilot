import { randomUUID } from "node:crypto";
import { AdapterError, DomainError } from "./domain/errors";
import { hash } from "./domain/hash";
import type { ActionManifest, ExecutionReceipt, PlannedAction, WriteContext } from "./domain/types";
import type { DurableStore } from "./persistence";
import type { ProviderPorts } from "./ports";

function connector(action: PlannedAction): ExecutionReceipt["connector"] {
  return action.type === "ARTIFACT_UPSERT" || action.type === "NOTION_TRACKER_UPSERT" ? "ARTIFACT" : action.type === "MAIL_SEND" ? "GMAIL" : "CALENDAR";
}

export async function executeManifest(input: {
  subjectId: string; subjectVersion: number; planHash: string; sourceSnapshotHash: string; calendarSnapshotHash: string;
  manifest: ActionManifest; ports: ProviderPorts; receipts: DurableStore;
  beforeAction?: (action: PlannedAction) => Promise<void>;
}): Promise<{ completed: boolean; receipts: ExecutionReceipt[] }> {
  const plannedAt = new Date().toISOString();
  await input.receipts.planReceipts(input.manifest.actions.map((action) => ({
    schema_version: "1.0", trace_id: randomUUID(), case_id: input.subjectId, action_id: action.action_id,
    plan_hash: input.planHash, connector: connector(action), operation: action.type, idempotency_key: action.idempotency_key,
    attempt: 1, status: "PLANNED", request_fingerprint: hash(action), started_at: plannedAt, evidence_refs: [input.sourceSnapshotHash],
  })));
  for (const action of input.manifest.actions) {
    await input.beforeAction?.(action);
    const existing = (await input.receipts.listReceipts(input.subjectId)).find((receipt) => receipt.action_id === action.action_id);
    if (existing?.status === "SUCCEEDED") continue;
    if (existing?.status === "STARTED" || existing?.status === "UNKNOWN" || (existing?.status === "FAILED" && existing.error?.retryable !== true)) throw new DomainError("This action requires manual reconciliation before it can continue.", "INVALID_STATE");
    const started = new Date();
    const receipt: ExecutionReceipt = {
      schema_version: "1.0", trace_id: existing?.trace_id ?? randomUUID(), case_id: input.subjectId, action_id: action.action_id,
      plan_hash: input.planHash, connector: connector(action), operation: action.type, idempotency_key: action.idempotency_key,
      attempt: existing?.status === "PLANNED" ? 1 : (existing?.attempt ?? 0) + 1, status: "STARTED", request_fingerprint: hash(action), started_at: started.toISOString(), evidence_refs: [input.sourceSnapshotHash],
    };
    await input.receipts.upsertReceipt(receipt);
    const context: WriteContext = { schema_version: "1.0", trace_id: receipt.trace_id, case_id: input.subjectId, case_version: input.subjectVersion, plan_id: input.manifest.plan_id, plan_hash: input.planHash, action_id: action.action_id, idempotency_key: action.idempotency_key, expected_snapshot_hash: input.calendarSnapshotHash, dry_run: false };
    try {
      const result = action.type === "ARTIFACT_UPSERT" ? await input.ports.artifact_writer.upsert_case_brief(context, action)
        : action.type === "NOTION_TRACKER_UPSERT" ? await input.ports.artifact_writer.upsert_tracker(context, action)
          : action.type === "MAIL_SEND" ? await input.ports.mail_writer.send(context, action)
            : await input.ports.calendar_writer.apply(context, action);
      if (!result.verified) throw new AdapterError({ category: "UNKNOWN_OUTCOME", retryable: false, safe_message: "The provider write could not be verified." });
      await input.receipts.upsertReceipt({ ...receipt, status: "SUCCEEDED", provider_ref: result.provider_ref, provider_version: result.provider_version, external_url: result.external_url, verified: true, before_hash: result.before_hash, after_hash: result.after_hash, completed_at: result.completed_at, latency_ms: Date.now() - started.getTime() });
    } catch (error) {
      const detail = error instanceof AdapterError ? error.detail : { category: "PERMANENT" as const, retryable: false, safe_message: "An unexpected provider failure occurred." };
      await input.receipts.upsertReceipt({ ...receipt, status: detail.category === "UNKNOWN_OUTCOME" ? "UNKNOWN" : "FAILED", error: detail, completed_at: new Date().toISOString(), latency_ms: Date.now() - started.getTime() });
      return { completed: false, receipts: await input.receipts.listReceipts(input.subjectId) };
    }
  }
  return { completed: true, receipts: await input.receipts.listReceipts(input.subjectId) };
}
