import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hash } from "../src/lib/domain/hash";
import { transition } from "../src/lib/domain/state-machine";
import type { ExecutionReceipt, RecoveryCase } from "../src/lib/domain/types";
import {
  analyzeCase,
  approveCase,
  executeCase,
  resetDemoCase,
  store,
} from "../src/lib/orchestrator";

const stateFile = path.join(process.cwd(), ".data", "state.json");
let originalState: Buffer | undefined;

beforeAll(async () => {
  try {
    originalState = await readFile(stateFile);
  } catch {
    originalState = undefined;
  }
});

afterAll(async () => {
  if (originalState) {
    await mkdir(path.dirname(stateFile), { recursive: true });
    await writeFile(stateFile, originalState, { mode: 0o600 });
  } else {
    await rm(stateFile, { force: true });
  }
});

describe.sequential("approval and execution integration", () => {
  beforeEach(async () => {
    await resetDemoCase("delay");
    await analyzeCase("demo", true);
  });

  it("rejects a stale case version without creating an approval", async () => {
    const item = await store.getCase("demo");
    await expect(approveCase("demo", item!.plans[0].plan_id, undefined, item!.version - 1)).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    expect((await store.getCase("demo"))?.approval).toBeUndefined();
    expect(await store.listReceipts("demo")).toEqual([]);
  });

  it("does not trust a client-supplied approval actor identity", async () => {
    const item = await store.getCase("demo");
    const approved = await approveCase("demo", item!.plans[0].plan_id, "attacker@example.com", item!.version);
    expect(approved.approval?.actor_id).not.toBe("attacker@example.com");
  });

  it("rejects an expired approval with zero action intents or writes", async () => {
    const item = await store.getCase("demo");
    const approved = await approveCase("demo", item!.plans[0].plan_id, undefined, item!.version);
    await store.saveCase({
      ...approved,
      approval: { ...approved.approval!, expires_at: "2000-01-01T00:00:00.000Z" },
    }, approved.version);
    await expect(executeCase("demo")).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    expect(await store.listReceipts("demo")).toEqual([]);
  });

  it("recomputes hashes and rejects a post-approval manifest edit", async () => {
    const item = await store.getCase("demo");
    const approved = await approveCase("demo", item!.plans[0].plan_id, undefined, item!.version);
    const selected = approved.plans.find((plan) => plan.plan_id === approved.selected_plan_id)!;
    const actions = selected.manifest.actions.map((action) =>
      action.type === "MAIL_SEND" ? { ...action, to: ["attacker@example.com"] } : action,
    );
    // Simulate storage corruption/tampering while retaining the stale declared hashes.
    const plans = approved.plans.map((plan) =>
      plan.plan_id === selected.plan_id
        ? { ...plan, manifest: { ...plan.manifest, actions } }
        : plan,
    );
    await store.saveCase({ ...approved, plans }, approved.version);
    await expect(executeCase("demo")).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    expect(await store.listReceipts("demo")).toEqual([]);
  });

  it("allows only one approval grant under a double-submit", async () => {
    const item = await store.getCase("demo");
    const outcomes = await Promise.allSettled([
      approveCase("demo", item!.plans[0].plan_id, undefined, item!.version),
      approveCase("demo", item!.plans[0].plan_id, undefined, item!.version),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
  });

  it("persists all three intents before execution and finishes from verified receipts", async () => {
    const item = await store.getCase("demo");
    const approved = await approveCase("demo", item!.plans[0].plan_id, undefined, item!.version);
    const completed = await executeCase("demo");
    const receipts = await store.listReceipts("demo");
    expect(completed.status).toBe("COMPLETED");
    expect(receipts.map((receipt) => receipt.connector)).toEqual(["ARTIFACT", "CALENDAR", "GMAIL"]);
    expect(receipts).toHaveLength(3);
    expect(receipts.every((receipt) => receipt.status === "SUCCEEDED" && receipt.verified === true)).toBe(true);
    expect(approved.approval?.consumed_at).toBeUndefined();
    expect(completed.approval?.consumed_at).toBeTruthy();
    const selected = completed.plans.find((plan) => plan.plan_id === completed.selected_plan_id)!;
    const { manifest_hash: _declared, ...unsigned } = selected.manifest;
    expect(selected.manifest.manifest_hash).toBe(hash(unsigned));
  });

  it("resumes an execution journal after a process restart", async () => {
    const reviewed = await store.getCase("demo");
    const approved = await approveCase("demo", reviewed!.plans[0].plan_id, undefined, reviewed!.version);
    const plan = approved.plans.find((item) => item.plan_id === approved.selected_plan_id)!;
    const started = "2026-09-13T08:10:00.000Z";
    await store.planReceipts(plan.manifest.actions.map((action): ExecutionReceipt => ({
      schema_version: "1.0", trace_id: `restart-${action.action_id}`, case_id: approved.case_id,
      action_id: action.action_id, plan_hash: plan.plan_hash,
      connector: action.type === "ARTIFACT_UPSERT" ? "ARTIFACT" : action.type === "MAIL_SEND" ? "GMAIL" : "CALENDAR",
      operation: action.type, idempotency_key: action.idempotency_key, attempt: 1, status: "PLANNED",
      request_fingerprint: hash(action), started_at: started, evidence_refs: [approved.source.message_id],
    })));
    const executing = transition(approved, "EXECUTING", started);
    await store.saveCase({ ...executing, approval: { ...executing.approval!, consumed_at: started } }, approved.version);
    const recovered = await executeCase("demo");
    expect(recovered.status).toBe("COMPLETED");
    expect(await store.listReceipts("demo")).toHaveLength(3);
  });

  it("never blindly retries a Gmail UNKNOWN outcome", async () => {
    const reviewed = await store.getCase("demo");
    const approved = await approveCase("demo", reviewed!.plans[0].plan_id, undefined, reviewed!.version);
    const plan = approved.plans.find((item) => item.plan_id === approved.selected_plan_id)!;
    const executing = transition(approved, "EXECUTING", "2026-09-13T08:10:00.000Z");
    const partial = transition(executing, "PARTIALLY_COMPLETED", "2026-09-13T08:11:00.000Z");
    await store.saveCase({ ...partial, approval: { ...partial.approval!, consumed_at: "2026-09-13T08:10:00.000Z" } }, approved.version);
    for (const action of plan.manifest.actions) {
      const mailUnknown = action.type === "MAIL_SEND";
      await store.upsertReceipt({
        schema_version: "1.0", trace_id: `unknown-${action.action_id}`, case_id: approved.case_id,
        action_id: action.action_id, plan_hash: plan.plan_hash,
        connector: action.type === "ARTIFACT_UPSERT" ? "ARTIFACT" : mailUnknown ? "GMAIL" : "CALENDAR",
        operation: action.type, idempotency_key: action.idempotency_key, attempt: 1,
        status: mailUnknown ? "UNKNOWN" : "SUCCEEDED", request_fingerprint: hash(action),
        provider_ref: mailUnknown ? undefined : `provider-${action.action_id}`, verified: mailUnknown ? undefined : true,
        started_at: "2026-09-13T08:10:00.000Z", completed_at: "2026-09-13T08:11:00.000Z", evidence_refs: [approved.source.message_id],
        error: mailUnknown ? { category: "UNKNOWN_OUTCOME", retryable: false, safe_message: "Manual reconciliation required." } : undefined,
      });
    }
    await expect(executeCase("demo")).rejects.toMatchObject({ code: "INVALID_STATE" });
    const gmailReceipt = (await store.listReceipts("demo")).find((receipt) => receipt.connector === "GMAIL");
    expect(gmailReceipt).toMatchObject({ status: "UNKNOWN", attempt: 1 });
  });
});
