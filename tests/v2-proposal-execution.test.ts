import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FakeProviders } from "../src/lib/adapters/fake";
import { hash } from "../src/lib/domain/hash";
import type { CalendarSnapshot } from "../src/lib/domain/types";
import { DurableStore } from "../src/lib/persistence";
import { ConversationStore } from "../src/lib/v2/conversation-persistence";
import { ConversationService } from "../src/lib/v2/conversation-service";
import { ProposalService } from "../src/lib/v2/proposal-service";

const USER = "20c8f906-7e8d-4d3f-b4d8-eb872aa4ed8f";
const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

function calendar(now: Date): CalendarSnapshot {
  const base = { captured_at: now.toISOString(), start_at: now.toISOString(), end_at: new Date(now.getTime() + 8 * 86_400_000).toISOString(), timezone: "Europe/Berlin", complete: true, events: [] };
  return { ...base, snapshot_hash: hash({ ...base, captured_at: undefined }) };
}

async function harness(fault?: "NOTION_TRACKER_UPSERT" | "CALENDAR_HOLD_UPSERT", suppliedSnapshot?: CalendarSnapshot) {
  const directory = await mkdtemp(path.join(tmpdir(), "ripple-v2-proposal-"));
  directories.push(directory);
  const time = { now: new Date() };
  const snapshot = suppliedSnapshot ?? calendar(time.now);
  const conversations = new ConversationStore(path.join(directory, "conversations.json"));
  const readers = () => ({ calendar: { snapshot: async () => snapshot }, mail: { scan: async () => ({ message_ids: [] }), get_message: async () => { throw new Error("not called"); } } });
  const authorize = async () => ({ calendarId: "calendar" });
  const assistant = new ConversationService(conversations, readers, authorize, () => time.now);
  const providers = new FakeProviders(fault ? { action_type: fault, category: fault === "CALENDAR_HOLD_UPSERT" ? "TRANSIENT" : "AUTH" } : {});
  const receipts = new DurableStore(path.join(directory, "receipts.json"));
  const proposals = new ProposalService(conversations, authorize, readers, () => providers, receipts, () => time.now);
  const created = await assistant.create(USER);
  const analyzed = await assistant.send(USER, created.conversation.conversation_id, { content: "Find 45 minutes this week", timezone: "Europe/Berlin" });
  return { proposals, providers, assistant, conversations, receipts, analyzed, snapshot, time };
}

describe("v2 proposal safety and execution", () => {
  it("turns a conflicting non-owned invitation into an exact proposed-time Calendar action", async () => {
    const now = new Date();
    const source = calendar(now);
    const monday = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const firstStart = new Date(monday); firstStart.setUTCHours(9, 30, 0, 0);
    const firstEnd = new Date(firstStart.getTime() + 90 * 60 * 1000);
    source.events = [
      { event_ref: "external-invite", source_calendar: "PRIMARY", provider_version: "v1", title: "External commitment", start_at: firstStart.toISOString(), end_at: firstEnd.toISOString(), timezone: "Europe/Berlin", attendees: [], organizer: "organizer@example.com", owned_by_operator: false, visibility: "DEFAULT" },
      { event_ref: "executive-review", source_calendar: "SELECTED", provider_version: "v1", title: "Executive review", start_at: new Date(firstStart.getTime() + 30 * 60 * 1000).toISOString(), end_at: new Date(firstEnd.getTime() + 30 * 60 * 1000).toISOString(), timezone: "Europe/Berlin", attendees: [], owned_by_operator: true, visibility: "DEFAULT" },
    ];
    source.snapshot_hash = hash({ ...source, captured_at: undefined });
    const setup = await harness(undefined, source);
    const created = await setup.assistant.create(USER);
    const analyzed = await setup.assistant.send(USER, created.conversation.conversation_id, { content: "Propose a new time for External commitment", timezone: "Europe/Berlin" });
    const draft = analyzed.proposals[0];
    expect(draft.target_event).toMatchObject({ event_ref: "external-invite", source_calendar: "PRIMARY", organizer_email: "organizer@example.com" });
    expect(draft.alternatives.every((item) => item.candidate_block && Date.parse(item.candidate_block.end_at) - Date.parse(item.candidate_block.start_at) === 90 * 60 * 1000)).toBe(true);
    const selectedView = await setup.proposals.select(USER, draft.proposal_id, draft.version, draft.alternatives[0].alternative_id);
    const calendarAction = selectedView.proposals[0].manifest?.actions.find((action) => action.type === "CALENDAR_HOLD_UPSERT");
    expect(calendarAction).toMatchObject({ title: "Proposed time · External commitment", proposal_for: { event_ref: "external-invite", organizer_email: "organizer@example.com" } });
  });

  it("keeps selection and confirmation write-free, then executes the exact Notion-first manifest once", async () => {
    const { proposals, providers, analyzed } = await harness();
    const draft = analyzed.proposals[0];
    const selectedView = await proposals.select(USER, draft.proposal_id, draft.version, draft.alternatives[0].alternative_id);
    const selected = selectedView.proposals[0];
    expect(selected.status).toBe("READY_FOR_REVIEW");
    expect(selected.manifest?.actions.map((action) => action.type)).toEqual(["NOTION_TRACKER_UPSERT", "CALENDAR_HOLD_UPSERT"]);
    const tracker = selected.manifest?.actions[0];
    expect(tracker?.type).toBe("NOTION_TRACKER_UPSERT");
    if (tracker?.type !== "NOTION_TRACKER_UPSERT") throw new Error("tracker fixture missing");
    expect(tracker).toMatchObject({ status: "PLANNED", chosen_decision: expect.any(String), impact: expect.any(String), next_deadline: expect.any(String), last_updated_at: expect.any(String) });
    expect(tracker.affected_commitments).toEqual(expect.any(Array));
    expect(tracker.decisions).toHaveLength(2);
    expect(tracker.decisions.some((item) => item.decision.includes("remain unchanged") && item.decision.includes("manually"))).toBe(true);
    expect(tracker.tasks.every((task) => task.owner_label && task.due_at && task.status)).toBe(true);
    expect(providers.writes.size).toBe(0);

    const approvedView = await proposals.confirm(USER, selected.proposal_id, { expected_version: selected.version, proposal_hash: selected.proposal_hash, manifest_hash: selected.manifest!.manifest_hash });
    expect(approvedView.proposals[0].status).toBe("APPROVED");
    expect(providers.writes.size).toBe(0);

    const originalCalendarApply = providers.calendar_writer.apply;
    providers.calendar_writer.apply = async (...args) => ({ ...(await originalCalendarApply(...args)), external_url: "https://calendar.google.com/calendar/event?eid=verified" });
    const executed = await proposals.execute(USER, selected.proposal_id);
    expect(executed.view.proposals[0].status).toBe("COMPLETED");
    expect(executed.receipts.map((receipt) => receipt.status)).toEqual(["SUCCEEDED", "SUCCEEDED"]);
    expect(executed.receipts.find((receipt) => receipt.connector === "CALENDAR")?.external_url).toBe("https://calendar.google.com/calendar/event?eid=verified");
    expect(providers.writes.size).toBe(2);
    await expect(proposals.execute(USER, selected.proposal_id)).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(providers.writes.size).toBe(2);
  });

  it("rejects without writes and makes the proposal terminal", async () => {
    const { proposals, providers, analyzed } = await harness();
    const draft = analyzed.proposals[0];
    const rejected = await proposals.reject(USER, draft.proposal_id, draft.version);
    expect(rejected.proposals[0].status).toBe("REJECTED");
    expect(providers.writes.size).toBe(0);
    await expect(proposals.select(USER, draft.proposal_id, rejected.proposals[0].version, draft.alternatives[0].alternative_id)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("invalidates confirmation when the bound calendar snapshot changes", async () => {
    const setup = await harness();
    const draft = setup.analyzed.proposals[0];
    const selectedView = await setup.proposals.select(USER, draft.proposal_id, draft.version, draft.alternatives[0].alternative_id);
    const selected = selectedView.proposals[0];
    setup.snapshot.snapshot_hash = "f".repeat(64);
    const result = await setup.proposals.confirm(USER, selected.proposal_id, { expected_version: selected.version, proposal_hash: selected.proposal_hash, manifest_hash: selected.manifest!.manifest_hash });
    expect(result.proposals[0].status).toBe("INVALIDATED");
    expect(setup.providers.writes.size).toBe(0);
  });

  it("invalidates a selected time that overlaps busy time even if a provider returns a stale snapshot hash", async () => {
    const setup = await harness();
    const draft = setup.analyzed.proposals[0];
    const selectedView = await setup.proposals.select(USER, draft.proposal_id, draft.version, draft.alternatives[0].alternative_id);
    const selected = selectedView.proposals[0];
    const block = selected.alternatives.find((alternative) => alternative.alternative_id === selected.selected_alternative_id)!.candidate_block!;
    setup.snapshot.events.push({
      event_ref: "existing-ripple-hold",
      provider_version: "1",
      title: "Team launch review",
      start_at: block.start_at,
      end_at: block.end_at,
      timezone: block.timezone,
      attendees: [],
      owned_by_operator: true,
      visibility: "DEFAULT",
    });

    const result = await setup.proposals.confirm(USER, selected.proposal_id, { expected_version: selected.version, proposal_hash: selected.proposal_hash, manifest_hash: selected.manifest!.manifest_hash });
    expect(result.proposals[0].status).toBe("INVALIDATED");
    expect(setup.providers.writes.size).toBe(0);
  });

  it("rejects tampered, expired, and cross-session confirmations without writes", async () => {
    const setup = await harness();
    const draft = setup.analyzed.proposals[0];
    const selectedView = await setup.proposals.select(USER, draft.proposal_id, draft.version, draft.alternatives[0].alternative_id);
    const selected = selectedView.proposals[0];
    await expect(setup.proposals.confirm(USER, selected.proposal_id, {
      expected_version: selected.version,
      proposal_hash: "f".repeat(64),
      manifest_hash: selected.manifest!.manifest_hash,
    })).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    await expect(setup.proposals.confirm("5dd4d46a-204d-43b8-991c-1229255ce109", selected.proposal_id, {
      expected_version: selected.version,
      proposal_hash: selected.proposal_hash,
      manifest_hash: selected.manifest!.manifest_hash,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    setup.time.now = new Date(Date.parse(selected.expires_at) + 1);
    await expect(setup.proposals.confirm(USER, selected.proposal_id, {
      expected_version: selected.version,
      proposal_hash: selected.proposal_hash,
      manifest_hash: selected.manifest!.manifest_hash,
    })).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    expect(setup.providers.writes.size).toBe(0);
  });

  it("invalidates an approved plan when Calendar changes before the first write", async () => {
    const setup = await harness();
    const draft = setup.analyzed.proposals[0];
    const selectedView = await setup.proposals.select(USER, draft.proposal_id, draft.version, draft.alternatives[0].alternative_id);
    const selected = selectedView.proposals[0];
    await setup.proposals.confirm(USER, selected.proposal_id, { expected_version: selected.version, proposal_hash: selected.proposal_hash, manifest_hash: selected.manifest!.manifest_hash });
    setup.snapshot.snapshot_hash = "e".repeat(64);
    await expect(setup.proposals.execute(USER, selected.proposal_id)).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    expect((await setup.conversations.proposal(selected.proposal_id, USER)).status).toBe("INVALIDATED");
    expect(setup.providers.writes.size).toBe(0);
    expect(await setup.receipts.listReceipts(selected.proposal_id)).toEqual([]);
  });

  it("binds every receipt to the immutable reviewed proposal hash", async () => {
    const setup = await harness();
    const draft = setup.analyzed.proposals[0];
    const selectedView = await setup.proposals.select(USER, draft.proposal_id, draft.version, draft.alternatives[0].alternative_id);
    const selected = selectedView.proposals[0];
    await setup.proposals.confirm(USER, selected.proposal_id, { expected_version: selected.version, proposal_hash: selected.proposal_hash, manifest_hash: selected.manifest!.manifest_hash });
    await setup.proposals.execute(USER, selected.proposal_id);
    expect((await setup.receipts.listReceipts(selected.proposal_id)).map((receipt) => receipt.plan_hash)).toEqual([selected.proposal_hash, selected.proposal_hash]);
  });

  it("allows only one concurrent confirmation to create an approval", async () => {
    const setup = await harness();
    const draft = setup.analyzed.proposals[0];
    const selectedView = await setup.proposals.select(USER, draft.proposal_id, draft.version, draft.alternatives[0].alternative_id);
    const selected = selectedView.proposals[0];
    const input = { expected_version: selected.version, proposal_hash: selected.proposal_hash, manifest_hash: selected.manifest!.manifest_hash };
    const results = await Promise.allSettled([setup.proposals.confirm(USER, selected.proposal_id, input), setup.proposals.confirm(USER, selected.proposal_id, input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await setup.conversations.proposal(selected.proposal_id, USER)).status).toBe("APPROVED");
    expect(setup.providers.writes.size).toBe(0);
  });

  it("leases execution so concurrent callers cannot enter provider writes", async () => {
    const setup = await harness();
    const draft = setup.analyzed.proposals[0];
    const selectedView = await setup.proposals.select(USER, draft.proposal_id, draft.version, draft.alternatives[0].alternative_id);
    const selected = selectedView.proposals[0];
    await setup.proposals.confirm(USER, selected.proposal_id, { expected_version: selected.version, proposal_hash: selected.proposal_hash, manifest_hash: selected.manifest!.manifest_hash });

    const original = setup.providers.artifact_writer.upsert_tracker;
    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    let trackerCalls = 0;
    setup.providers.artifact_writer.upsert_tracker = async (context, action) => {
      trackerCalls += 1;
      entered();
      await releasePromise;
      return original(context, action);
    };

    const first = setup.proposals.execute(USER, selected.proposal_id);
    await enteredPromise;
    await expect(setup.proposals.execute(USER, selected.proposal_id)).rejects.toMatchObject({ code: "INVALID_STATE" });
    release();
    const completed = await first;
    expect(completed.view.proposals[0].status).toBe("COMPLETED");
    expect(trackerCalls).toBe(1);
    expect(setup.providers.writes.size).toBe(2);
  });

  it("invalidates the selected proposal before persisting its refinement", async () => {
    const setup = await harness();
    const draft = setup.analyzed.proposals[0];
    const selectedView = await setup.proposals.select(USER, draft.proposal_id, draft.version, draft.alternatives[0].alternative_id);
    const selected = selectedView.proposals[0];
    const refined = await setup.assistant.send(USER, setup.analyzed.conversation.conversation_id, {
      content: "Make it later in the week",
      timezone: "Europe/Berlin",
      supersedes_proposal_id: selected.proposal_id,
    });
    expect(refined.proposals.find((proposal) => proposal.proposal_id === selected.proposal_id)?.status).toBe("INVALIDATED");
    expect(refined.proposals.at(-1)?.status).toBe("DRAFT");
    await expect(setup.proposals.confirm(USER, selected.proposal_id, {
      expected_version: selected.version,
      proposal_hash: selected.proposal_hash,
      manifest_hash: selected.manifest!.manifest_hash,
    })).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    expect(setup.providers.writes.size).toBe(0);
  });

  it("suppresses Calendar when the required Notion tracker fails", async () => {
    const { proposals, providers, analyzed } = await harness("NOTION_TRACKER_UPSERT");
    const draft = analyzed.proposals[0];
    const selectedView = await proposals.select(USER, draft.proposal_id, draft.version, draft.alternatives[0].alternative_id);
    const selected = selectedView.proposals[0];
    await proposals.confirm(USER, selected.proposal_id, { expected_version: selected.version, proposal_hash: selected.proposal_hash, manifest_hash: selected.manifest!.manifest_hash });
    const executed = await proposals.execute(USER, selected.proposal_id);
    expect(executed.view.proposals[0].status).toBe("PARTIALLY_COMPLETED");
    expect(executed.receipts[0]).toMatchObject({ connector: "ARTIFACT", status: "FAILED" });
    expect(executed.receipts.find((receipt) => receipt.connector === "CALENDAR")?.status).toBe("PLANNED");
    expect(providers.writes.size).toBe(0);
  });

  it("retains the verified tracker receipt and retries only Calendar after a retryable failure", async () => {
    const setup = await harness("CALENDAR_HOLD_UPSERT");
    const draft = setup.analyzed.proposals[0];
    const selectedView = await setup.proposals.select(USER, draft.proposal_id, draft.version, draft.alternatives[0].alternative_id);
    const selected = selectedView.proposals[0];
    await setup.proposals.confirm(USER, selected.proposal_id, { expected_version: selected.version, proposal_hash: selected.proposal_hash, manifest_hash: selected.manifest!.manifest_hash });
    const first = await setup.proposals.execute(USER, selected.proposal_id);
    expect(first.view.proposals[0].status).toBe("PARTIALLY_COMPLETED");
    expect(first.receipts.map((receipt) => receipt.status)).toEqual(["SUCCEEDED", "FAILED"]);
    expect(setup.providers.writes.size).toBe(1);

    const recoveredProviders = new FakeProviders();
    const recoveredService = new ProposalService(setup.conversations, async () => ({ calendarId: "calendar" }), () => ({ calendar: { snapshot: async () => setup.snapshot }, mail: { scan: async () => ({ message_ids: [] }), get_message: async () => { throw new Error("not called"); } } }), () => recoveredProviders, setup.receipts, () => setup.time.now);
    const recovered = await recoveredService.execute(USER, selected.proposal_id);
    expect(recovered.view.proposals[0].status).toBe("COMPLETED");
    expect(recovered.receipts.map((receipt) => receipt.status)).toEqual(["SUCCEEDED", "SUCCEEDED"]);
    expect(recoveredProviders.writes.size).toBe(1);
  });
});
