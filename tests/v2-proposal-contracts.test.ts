import { describe, expect, it } from "vitest";
import {
  schedulingProposalSchema,
  v2ActionManifestSchema,
  V2_SCHEMA_VERSION,
} from "../src/lib/v2/contracts";

const HASH = "a".repeat(64);
const PROPOSAL_ID = "20c8f906-7e8d-4d3f-b4d8-eb872aa4ed8f";
const CONVERSATION_ID = "275f1f88-5e73-44e6-88c3-df371ae61a3e";
const USER_ID = "1035e0ee-4caf-4529-9f96-fd1c71800c25";
const ALTERNATIVE_ID = "68937596-d12b-4710-9d2d-aaef35c30d2d";

function tracker() {
  return {
    action_id: "tracker-action",
    idempotency_key: "tracker-idempotency",
    required: true,
    type: "NOTION_TRACKER_UPSERT" as const,
    title: "Ripple · Executive focus",
    executive_summary: "Protect time and make the follow-through explicit.",
    decision_at: "2026-09-13T18:00:00.000Z",
    status: "PLANNED" as const,
    chosen_decision: "Protect Monday morning",
    impact: "Preparation time is protected.",
    next_deadline: "2026-09-14T09:00:00.000Z",
    last_updated_at: "2026-09-13T18:00:00.000Z",
    affected_commitments: [],
    decisions: [
      { decision: "Protect Monday morning", decided_at: "2026-09-13T18:00:00.000Z" },
      { decision: "Existing meetings remain unchanged and must be moved manually if needed.", decided_at: "2026-09-13T18:00:00.000Z" },
    ],
    tasks: [{
      task_id: "prepare-task",
      title: "Prepare for the protected session",
      owner_label: "Executive",
      due_at: "2026-09-14T09:00:00.000Z",
      timezone: "Europe/Berlin",
      status: "NOT_STARTED" as const,
      source_action_id: "tracker-action",
    }],
  };
}

function calendar() {
  return {
    action_id: "calendar-action",
    idempotency_key: "calendar-idempotency",
    required: true,
    type: "CALENDAR_HOLD_UPSERT" as const,
    title: "Executive preparation",
    start_at: "2026-09-14T09:00:00.000Z",
    end_at: "2026-09-14T09:45:00.000Z",
    timezone: "Europe/Berlin",
  };
}

function manifest() {
  return {
    schema_version: "1.0" as const,
    case_id: PROPOSAL_ID,
    case_version: 2,
    plan_id: ALTERNATIVE_ID,
    actions: [tracker(), calendar()],
    manifest_hash: HASH,
  };
}

function proposal(status: "DRAFT" | "READY_FOR_REVIEW" = "DRAFT") {
  return {
    schema_version: V2_SCHEMA_VERSION,
    proposal_id: PROPOSAL_ID,
    conversation_id: CONVERSATION_ID,
    user_id: USER_ID,
    version: status === "DRAFT" ? 1 : 2,
    status,
    intent: "PREPARE_WEEK" as const,
    title: "Your week at a glance",
    summary: "One preparation window is available.",
    assumptions: ["Working hours are 09:00–17:00 in Europe/Berlin."],
    insights: [{ kind: "INFORMATION" as const, title: "Open window", detail: "Monday morning is open.", event_refs: [] }],
    alternatives: [{
      alternative_id: ALTERNATIVE_ID,
      title: "Protect Monday morning",
      summary: "Create one preparation block.",
      tradeoffs: ["Uses an open window"],
      recommended: true,
      candidate_block: {
        title: "Executive preparation",
        start_at: "2026-09-14T09:00:00.000Z",
        end_at: "2026-09-14T09:45:00.000Z",
        timezone: "Europe/Berlin",
      },
    }],
    ...(status === "READY_FOR_REVIEW" ? { selected_alternative_id: ALTERNATIVE_ID, manifest: manifest() } : {}),
    calendar_snapshot_hash: HASH,
    calendar_window: { start_at: "2026-09-13T18:00:00.000Z", end_at: "2026-09-21T18:00:00.000Z", timezone: "Europe/Berlin" },
    source_context_hash: HASH,
    proposal_hash: HASH,
    expires_at: "2026-09-13T18:15:00.000Z",
  };
}

describe("v2 executable proposal contracts", () => {
  it("accepts a reviewable proposal with an exact Notion-first manifest", () => {
    expect(schedulingProposalSchema.safeParse(proposal("READY_FOR_REVIEW")).success).toBe(true);
  });

  it("keeps draft proposals non-executable and requires manifests for actionable states", () => {
    expect(schedulingProposalSchema.safeParse({ ...proposal(), selected_alternative_id: ALTERNATIVE_ID, manifest: manifest() }).success).toBe(false);
    const reviewable = proposal("READY_FOR_REVIEW");
    expect(schedulingProposalSchema.safeParse({ ...reviewable, manifest: undefined }).success).toBe(false);
  });

  it("requires a selected alternative that belongs to the proposal", () => {
    expect(schedulingProposalSchema.safeParse({
      ...proposal("READY_FOR_REVIEW"),
      selected_alternative_id: "aa311181-0e2b-4ebc-827a-2e34c85f10dc",
    }).success).toBe(false);
  });

  it("rejects out-of-order or duplicate provider actions", () => {
    const canonical = manifest();
    expect(v2ActionManifestSchema.safeParse({ ...canonical, actions: [calendar(), tracker()] }).success).toBe(false);
    expect(v2ActionManifestSchema.safeParse({ ...canonical, actions: [tracker(), calendar(), calendar()] }).success).toBe(false);
  });

  it("rejects inverted intervals and invalid timezones in executable Calendar actions", () => {
    const canonical = manifest();
    expect(v2ActionManifestSchema.safeParse({
      ...canonical,
      actions: [tracker(), { ...calendar(), end_at: calendar().start_at }],
    }).success).toBe(false);
    expect(v2ActionManifestSchema.safeParse({
      ...canonical,
      actions: [tracker(), { ...calendar(), timezone: "Mars/Olympus" }],
    }).success).toBe(false);
  });

  it("rejects BCC recipients and unreviewed fields", () => {
    const canonical = manifest();
    const mail = {
      action_id: "mail-action",
      idempotency_key: "mail-idempotency",
      required: true,
      type: "MAIL_SEND" as const,
      to: ["stakeholder1@example.com"],
      cc: [],
      bcc: ["hidden@example.com"],
      subject: "Schedule update",
      body_text: "The reviewed schedule update.",
    };
    expect(v2ActionManifestSchema.safeParse({ ...canonical, actions: [tracker(), calendar(), mail] }).success).toBe(false);
    expect(v2ActionManifestSchema.safeParse({ ...canonical, debug_payload: "provider data" }).success).toBe(false);
  });
});
