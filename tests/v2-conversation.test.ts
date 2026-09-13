import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hash } from "../src/lib/domain/hash";
import type { CalendarSnapshot, SourceMessage } from "../src/lib/domain/types";
import { ConversationStore } from "../src/lib/v2/conversation-persistence";
import { ConversationService } from "../src/lib/v2/conversation-service";
import { publicConversationView, publicConversationViewSchema, schedulingProposalSchema } from "../src/lib/v2/contracts";
import { safeNotice, type ReadContextPorts } from "../src/lib/v2/read-context";
import { sanitizeAssistantPlan, type AssistantPlanner } from "../src/lib/v2/smart-assistant";

const directories: string[] = [];
const USER = "20c8f906-7e8d-4d3f-b4d8-eb872aa4ed8f";
const OTHER = "275f1f88-5e73-44e6-88c3-df371ae61a3e";
const NOW = new Date("2026-09-13T08:00:00.000Z");

afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

function snapshot(): CalendarSnapshot {
  const base = {
    captured_at: NOW.toISOString(), start_at: NOW.toISOString(), end_at: "2026-09-21T08:00:00.000Z", timezone: "Europe/Berlin", complete: true,
    events: [
      { event_ref: "board", provider_version: "1", title: "Board review", start_at: "2026-09-14T08:00:00.000Z", end_at: "2026-09-14T09:00:00.000Z", timezone: "Europe/Berlin", attendees: ["private@example.com"], organizer: "private@example.com", owned_by_operator: false, visibility: "DEFAULT" as const },
      { event_ref: "private", provider_version: "1", title: "Sensitive acquisition", start_at: "2026-09-14T08:45:00.000Z", end_at: "2026-09-14T09:30:00.000Z", timezone: "Europe/Berlin", attendees: ["private@example.com"], organizer: "private@example.com", owned_by_operator: false, visibility: "PRIVATE" as const },
    ],
  };
  return { ...base, snapshot_hash: hash({ ...base, captured_at: undefined }) };
}

async function harness(planner?: AssistantPlanner) {
  const directory = await mkdtemp(path.join(tmpdir(), "ripple-v2-conversation-"));
  directories.push(directory);
  const writes = { calendar: 0, mail: 0, artifact: 0 };
  const notice: SourceMessage = { message_id: "notice-1", thread_id: "thread-1", source_version: "1", content_hash: "content", received_at: "2026-09-13T07:00:00.000Z", from: "alerts@example.com", subject: "Flight time changed", body_text: "Private body must not be persisted." };
  const ports: ReadContextPorts = {
    calendar: { snapshot: async () => snapshot() },
    mail: { scan: async () => ({ message_ids: [notice.message_id] }), get_message: async () => notice },
  };
  const service = new ConversationService(new ConversationStore(path.join(directory, "state.json")), () => ports, async () => ({ calendarId: "private-calendar-id" }), () => NOW, planner);
  return { service, writes };
}

describe("v2 read-only assistant", () => {
  it("bounds and normalizes labeled-email content while preferring the reply contact", () => {
    const source: SourceMessage = { message_id: "raw", thread_id: "thread", source_version: "1", content_hash: "hash", received_at: NOW.toISOString(), from: "Sender <sender@example.com>", subject: "  Meeting   request  ", body_text: `First line\n\n${"detail ".repeat(300)}` };
    const notice = safeNotice({ ...source, from: "Requester <requester@example.com>" }, "safe-ref");
    expect(notice).toMatchObject({ message_ref: "safe-ref", sender_email: "requester@example.com", subject: "Meeting request" });
    expect(notice.excerpt.length).toBeLessThanOrEqual(1200);
    expect(notice.excerpt).not.toContain("\n");
  });

  it("grounds Prepare my week in a privacy-filtered snapshot and produces structured options", async () => {
    const { service, writes } = await harness();
    const created = await service.create(USER);
    const view = await service.send(USER, created.conversation.conversation_id, { content: "Prepare my week", timezone: "Europe/Berlin" });
    expect(publicConversationViewSchema.safeParse(publicConversationView(view)).success).toBe(true);
    expect(JSON.stringify(publicConversationView(view))).not.toContain(USER);
    expect(schedulingProposalSchema.safeParse(view.proposals[0]).success).toBe(true);
    expect(view.proposals[0].intent).toBe("PREPARE_WEEK");
    expect(view.proposals[0].insights.some((insight) => insight.kind === "CONFLICT")).toBe(true);
    expect(JSON.stringify(view)).not.toContain("Sensitive acquisition");
    expect(JSON.stringify(view)).not.toContain("private@example.com");
    expect(writes).toEqual({ calendar: 0, mail: 0, artifact: 0 });
  });

  it("returns up to three deterministic candidate windows without an executable manifest", async () => {
    const { service } = await harness();
    const created = await service.create(USER);
    const view = await service.send(USER, created.conversation.conversation_id, { content: "Find 60 minutes this week", intent: "FIND_TIME", timezone: "Europe/Berlin" });
    const proposal = view.proposals[0];
    expect(proposal.alternatives).toHaveLength(3);
    expect(proposal.alternatives.every((alternative) => Boolean(alternative.candidate_block))).toBe(true);
    expect(proposal).not.toHaveProperty("manifest");
    expect(proposal.status).toBe("DRAFT");
  });

  it("reviews only safe notice metadata and never persists the source body or message id", async () => {
    const { service } = await harness();
    const created = await service.create(USER);
    const view = await service.send(USER, created.conversation.conversation_id, { content: "Review recent changes", timezone: "Europe/Berlin" });
    expect(view.proposals[0].insights.some((insight) => insight.kind === "RECENT_CHANGE" && insight.title === "Flight time changed")).toBe(true);
    expect(JSON.stringify(view)).not.toContain("Private body must not be persisted");
    expect(JSON.stringify(view)).not.toContain("notice-1");
  });

  it("isolates conversations by the server-owned session", async () => {
    const { service } = await harness();
    const created = await service.create(USER);
    await expect(service.get(OTHER, created.conversation.conversation_id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not describe the informational fallback as an attention item", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ripple-v2-calm-"));
    directories.push(directory);
    const emptySnapshot = snapshot();
    emptySnapshot.events = [];
    emptySnapshot.snapshot_hash = hash({ ...emptySnapshot, captured_at: undefined });
    const service = new ConversationService(
      new ConversationStore(path.join(directory, "state.json")),
      () => ({ calendar: { snapshot: async () => emptySnapshot }, mail: { scan: async () => ({ message_ids: [] }), get_message: async () => { throw new Error("not called"); } } }),
      async () => ({ calendarId: "calendar" }),
      () => NOW,
    );
    const created = await service.create(USER);
    const view = await service.send(USER, created.conversation.conversation_id, { content: "Prepare my week", timezone: "Europe/Berlin" });
    expect(view.proposals[0].summary).toMatch(/^No items need attention;/);
  });

  it("uses the smart planner to answer the requested time and ask a material preference", async () => {
    let plannerInputSeen = false;
    const planner: AssistantPlanner = {
      plan: async (input) => {
        plannerInputSeen = true;
        expect(input.content).toBe("I want Monday 10–11 AM to be free. What can be done?");
        expect(input.snapshot.events.some((event) => event.title === "Private commitment")).toBe(true);
        expect(JSON.stringify(input.snapshot)).not.toContain("Sensitive acquisition");
        return {
          intent: "FIND_TIME",
          title: "Monday 10–11 needs a choice",
          summary: "Your board review is the highest-priority commitment in that hour, so I would protect it rather than suggest an unrelated opening.",
          clarification_question: "Should I find another full hour, or protect the free portion around the board review?",
          assumptions: ["Board and external commitments take priority over flexible internal work."],
          labeled_email_action: null,
          insights: [{ kind: "CONFLICT", title: "Protect the board review", detail: "The board review overlaps the requested hour and should remain unchanged.", event_refs: ["board"] }],
          alternatives: [],
        };
      },
    };
    const { service, writes } = await harness(planner);
    const created = await service.create(USER);
    const view = await service.send(USER, created.conversation.conversation_id, { content: "I want Monday 10–11 AM to be free. What can be done?", timezone: "Europe/Berlin" });
    expect(plannerInputSeen).toBe(true);
    expect(view.proposals[0].title).toBe("Monday 10–11 needs a choice");
    expect(view.proposals[0].summary).toContain("Should I find another full hour");
    expect(view.proposals[0].alternatives).toEqual([]);
    expect(writes).toEqual({ calendar: 0, mail: 0, artifact: 0 });
  });

  it("keeps a smart answer but removes a model suggestion that conflicts with Calendar", () => {
    const unsafe = sanitizeAssistantPlan({
      intent: "PROTECT_TIME",
      title: "Protect Monday morning",
      summary: "I can protect the requested hour.",
      clarification_question: null,
      assumptions: [],
      labeled_email_action: null,
      insights: [{ kind: "INFORMATION", title: "Requested time", detail: "Monday morning", event_refs: ["unknown-ref"] }],
      alternatives: [{
        title: "Protect 10–11",
        summary: "Create a focus hold.",
        tradeoffs: ["Keeps the hour unavailable"],
        recommended: true,
        candidate_block: { title: "Focus time", start_at: "2026-09-14T08:00:00.000Z", end_at: "2026-09-14T09:00:00.000Z", timezone: "Europe/Berlin" },
      }],
    }, {
      content: "Protect Monday 10–11",
      intentHint: "PROTECT_TIME",
      timezone: "Europe/Berlin",
      now: NOW,
      snapshot: snapshot(),
      notices: [],
      recentMessages: [],
    });
    expect(unsafe.alternatives).toEqual([]);
    expect(unsafe.clarification_question).toContain("nearest full opening");
    expect(unsafe.insights[0].event_refs).toEqual([]);
  });

  it("normalizes a safe model time with a timezone offset before proposal validation", () => {
    const safe = sanitizeAssistantPlan({
      intent: "PROTECT_TIME",
      title: "Protect the requested hour",
      summary: "The requested hour is free.",
      clarification_question: null,
      assumptions: [],
      labeled_email_action: null,
      insights: [],
      alternatives: [{
        title: "Protect 2–3 PM",
        summary: "Create a focus hold.",
        tradeoffs: ["Keeps the hour unavailable"],
        recommended: true,
        candidate_block: { title: "Focus time", start_at: "2026-09-14T14:00:00+02:00", end_at: "2026-09-14T15:00:00+02:00", timezone: "Europe/Berlin" },
      }],
    }, {
      content: "Protect Monday 2–3 PM",
      intentHint: "PROTECT_TIME",
      timezone: "Europe/Berlin",
      now: NOW,
      snapshot: snapshot(),
      notices: [],
      recentMessages: [],
    });
    expect(safe.alternatives[0].candidate_block).toMatchObject({
      start_at: "2026-09-14T12:00:00.000Z",
      end_at: "2026-09-14T13:00:00.000Z",
    });
  });
});
