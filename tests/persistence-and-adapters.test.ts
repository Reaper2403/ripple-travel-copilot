import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeProviders, validateContext } from "../src/lib/adapters/fake";
import { NotionArtifactAdapter } from "../src/lib/adapters/notion";
import type { ServerConfig } from "../src/lib/config";
import { AdapterError } from "../src/lib/domain/errors";
import { deterministicExtract } from "../src/lib/domain/extractor";
import { hash } from "../src/lib/domain/hash";
import { planRecovery } from "../src/lib/domain/planner";
import type { ExecutionReceipt, FollowThroughTrackerAction, RecoveryCase, WriteContext } from "../src/lib/domain/types";
import { DEMO_MESSAGES } from "../src/lib/fixtures";
import { DurableStore } from "../src/lib/persistence";

const tempDirs: string[] = [];
afterEach(async () => Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

function caseFixture(): RecoveryCase {
  return {
    schema_version: "1.0",
    case_id: "case-persistence-test",
    version: 1,
    status: "INGESTED",
    source: DEMO_MESSAGES.delay,
    source_snapshot_hash: hash(DEMO_MESSAGES.delay),
    facts: deterministicExtract(DEMO_MESSAGES.delay),
    impacts: [],
    plans: [],
    created_at: "2026-09-13T08:00:00.000Z",
    updated_at: "2026-09-13T08:00:00.000Z",
  };
}

async function createStore(): Promise<{ store: DurableStore; filename: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), "ripple-test-"));
  tempDirs.push(directory);
  const filename = path.join(directory, "state.json");
  return { store: new DurableStore(filename), filename };
}

describe("durable store", () => {
  it("enforces optimistic case versions without overwriting durable state", async () => {
    const { store } = await createStore();
    const original = caseFixture();
    await store.saveCase(original);
    await expect(store.saveCase({ ...original, version: 2 }, 99)).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    expect(await store.getCase(original.case_id)).toEqual(original);
  });

  it("upserts an action receipt rather than duplicating it after restart", async () => {
    const { store, filename } = await createStore();
    const receipt: ExecutionReceipt = {
      schema_version: "1.0",
      trace_id: "trace-test",
      case_id: "case-persistence-test",
      action_id: "action-notion",
      plan_hash: "a".repeat(64),
      connector: "ARTIFACT",
      operation: "upsert_case_brief",
      idempotency_key: "case:plan:notion",
      attempt: 1,
      status: "STARTED",
      request_fingerprint: "request-fingerprint",
      started_at: "2026-09-13T08:00:00.000Z",
      evidence_refs: [],
    };
    await store.upsertReceipt(receipt);
    const restarted = new DurableStore(filename);
    await restarted.upsertReceipt({ ...receipt, status: "SUCCEEDED", verified: true });
    expect(await restarted.listReceipts(receipt.case_id)).toEqual([{ ...receipt, status: "SUCCEEDED", verified: true }]);
    expect(JSON.parse(await readFile(filename, "utf8")).receipts).toHaveLength(1);
  });
});

describe("provider contract doubles", () => {
  const context: WriteContext = {
    schema_version: "1.0",
    trace_id: "trace-test",
    case_id: "case-test",
    case_version: 3,
    plan_id: "plan-test",
    plan_hash: "b".repeat(64),
    action_id: "action-test",
    idempotency_key: "case-test:plan-test:action-test",
    expected_snapshot_hash: "c".repeat(64),
    dry_run: false,
  };

  it("fails malformed write contexts before an external effect", () => {
    expect(() => validateContext({ ...context, plan_hash: "not-a-hash" })).toThrow(AdapterError);
  });

  it("reuses the same result for one idempotency key", async () => {
    const fake = new FakeProviders();
    const plans = planRecovery(caseFixture(), ["stakeholder1@example.com"]);
    const artifact = plans[0].manifest.actions[0];
    expect(artifact.type).toBe("ARTIFACT_UPSERT");
    if (artifact.type !== "ARTIFACT_UPSERT") throw new Error("fixture mismatch");
    const first = await fake.artifact_writer.upsert_case_brief(context, artifact);
    const second = await fake.artifact_writer.upsert_case_brief(context, { ...artifact, title: "mutated retry" });
    expect(second).toEqual(first);
    expect(fake.writes.size).toBe(1);
  });

  it("classifies unknown mail outcomes as non-retryable", async () => {
    const fake = new FakeProviders({ action_type: "MAIL_SEND", category: "UNKNOWN_OUTCOME" });
    const mail = planRecovery(caseFixture(), ["stakeholder1@example.com"])[0].manifest.actions[2];
    expect(mail.type).toBe("MAIL_SEND");
    if (mail.type !== "MAIL_SEND") throw new Error("fixture mismatch");
    await expect(fake.mail_writer.send(context, mail)).rejects.toMatchObject({
      detail: { category: "UNKNOWN_OUTCOME", retryable: false },
    });
  });

  it("reconciles a paginated Notion tracker by appending only missing Ripple tasks", async () => {
    const action: FollowThroughTrackerAction = {
      type: "NOTION_TRACKER_UPSERT",
      action_id: "tracker-action",
      idempotency_key: "tracker-idempotency",
      required: true,
      title: "Ripple · Weekly focus",
      executive_summary: "Protect preparation time and capture the follow-through.",
      decision_at: "2026-09-13T08:00:00.000Z",
      status: "PLANNED",
      chosen_decision: "Protect the earliest opening",
      impact: "Preparation time is exposed.",
      next_deadline: "2026-09-14T08:00:00.000Z",
      last_updated_at: "2026-09-13T08:00:00.000Z",
      affected_commitments: [{ title: "Board review", time_label: "Monday morning", owner_label: "Calendar owner", impact: "Preparation time is tight.", chosen_response: "Protect preparation time." }],
      decisions: [{ decision: "Protect the earliest opening", decided_at: "2026-09-13T08:00:00.000Z" }],
      tasks: [
        { task_id: "task-one", title: "Prepare", owner_label: "Executive", status: "NOT_STARTED", source_action_id: "tracker-action" },
        { task_id: "task-two", title: "Review", owner_label: "Executive", status: "NOT_STARTED", source_action_id: "tracker-action" },
      ],
    };
    const humanBlock = { id: "human-note", type: "paragraph", paragraph: { rich_text: [{ plain_text: "Human note: keep this wording." }] } };
    const existing = [
      { id: "marker", type: "paragraph", paragraph: { rich_text: [{ plain_text: "Ripple tracker case-test" }] } },
      { id: "task-one", type: "to_do", to_do: { rich_text: [{ plain_text: "Prepare [Ripple task task-one]" }], checked: true } },
      humanBlock,
      ...["Week at a glance", "At a glance", "What changed", "Affected commitments", "Next actions", "Decision log"].map((title) => ({ id: `heading-${title}`, type: "heading_2", heading_2: { rich_text: [{ plain_text: title }] } })),
    ];
    const afterAppend = [...existing, { id: "task-two", type: "to_do", to_do: { rich_text: [{ plain_text: "Review [Ripple task task-two]" }], checked: false } }];
    let trackerReads = 0;
    const list = vi.fn(async ({ block_id, start_cursor }: { block_id: string; start_cursor?: string }) => {
      if (block_id === "parent" && !start_cursor) return { results: [], has_more: true, next_cursor: "page-2" };
      if (block_id === "parent") return { results: [{ id: "tracker-page", type: "child_page", child_page: { title: action.title } }], has_more: false, next_cursor: null };
      trackerReads += 1;
      return { results: trackerReads === 1 ? existing : afterAppend, has_more: false, next_cursor: null };
    });
    const append = vi.fn(async (_input: { block_id: string; children: unknown[] }) => ({}));
    const create = vi.fn(async () => ({ id: "unexpected" }));
    const adapter = new NotionArtifactAdapter({ PROVIDER_MODE: "real", RIPPLE_OPERATOR_EMAIL: "operator@example.com", DEMO_STAKEHOLDER_EMAILS: "host@example.com", GOOGLE_CALENDAR_ID: "primary", GMAIL_INGEST_LABEL: "TravelCopilot/Test", OPENAI_MODEL: "gpt-5.6-terra", NOTION_ACCESS_TOKEN: "test-token", NOTION_PARENT_PAGE_ID: "parent", stakeholder_emails: ["host@example.com"] } satisfies ServerConfig);
    (adapter as unknown as { client: unknown }).client = {
      blocks: { children: { list, append } },
      pages: { create, retrieve: vi.fn(async () => ({ id: "tracker-page", last_edited_time: "2026-09-13T08:01:00.000Z" })) },
    };

    const result = await adapter.upsert_tracker(context, action);
    expect(result).toMatchObject({ outcome: "SUCCEEDED", provider_ref: "tracker-page", verified: true });
    expect(list).toHaveBeenCalledTimes(4);
    expect(append).toHaveBeenCalledTimes(1);
    const appended = append.mock.calls[0][0] as { children: unknown[] };
    expect(JSON.stringify(appended.children)).toContain("ripple.local/task/task-two");
    expect(JSON.stringify(appended.children)).not.toContain("Ripple task task-two");
    expect(JSON.stringify(appended.children)).not.toContain("ripple.local/task/task-one");
    expect(JSON.stringify(appended.children)).not.toContain("Human note");
    expect(create).not.toHaveBeenCalled();
  });
});
