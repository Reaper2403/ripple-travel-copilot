import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ActionConfirmationCard, type ExactManifestVM } from "../components/v2/action-confirmation-card";
import { NotionArtifactAdapter } from "../src/lib/adapters/notion";
import type { ServerConfig } from "../src/lib/config";
import type { FollowThroughTrackerAction, WriteContext } from "../src/lib/domain/types";

const manifest: ExactManifestVM = {
  proposalId: "proposal-pm-gate",
  version: 2,
  proposalHash: "a".repeat(64),
  manifestHash: "b".repeat(64),
  expiresAt: "2099-09-13T12:00:00.000Z",
  assumptions: ["No invitations will be sent."],
  actions: [
    {
      id: "notion-action",
      provider: "notion",
      title: "Ripple · Protect board preparation",
      destination: "Executive follow-through",
      executiveSummary: "Protect a focused preparation block and capture the next decision.",
      trackerStatus: "Planned",
      chosenDecision: "Protect the earliest opening",
      impact: "Board preparation time is exposed.",
      nextDeadline: "Mon, Sep 14, 9:00 AM",
      affectedCommitments: [{ title: "Board review", time: "Monday morning", owner: "Calendar owner", impact: "Preparation is tight", response: "Protect a preparation block" }],
      decisions: [{ decision: "Existing meetings remain unchanged and require manual review.", decidedAt: "Sep 13, 10:00 AM" }],
      tasks: [
        { id: "prepare", title: "Prepare briefing", owner: "Executive", due: "Mon, Sep 14, 9:00 AM", status: "Not started" },
        { id: "review", title: "Review outcomes", owner: "Executive", due: "Mon, Sep 14, 9:45 AM", status: "Not started" },
      ],
    },
    {
      id: "calendar-action",
      provider: "calendar",
      title: "Executive preparation",
      calendar: "Primary calendar",
      start: "Mon, Sep 14, 9:00 AM",
      end: "9:45 AM",
      timezone: "Europe/Berlin",
      attendees: [],
    },
  ],
};

describe("v2 PM closure and accessibility contracts", () => {
  it("keeps the exact confirmation as a labelled region with explicit keyboard controls", () => {
    const markup = renderToStaticMarkup(createElement(ActionConfirmationCard, {
      manifest,
      state: "ready",
      onConfirm: vi.fn(),
      onReject: vi.fn(),
      onRefine: vi.fn(),
    }));
    expect(markup).toContain('aria-labelledby="confirmation-title"');
    expect(markup).toContain('id="confirmation-title"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain("Confirm and make 2 updates");
    expect(markup).toContain("Refine plan");
    expect(markup).toContain("Not now");
    expect(markup).toContain("Typing “yes” or selecting an option cannot approve these changes.");
  });

  it("provides a desktop Back route from completion while keeping a mobile Back alternative", () => {
    const screen = readFileSync("components/v2/onboarding-screen.tsx", "utf8");
    const shell = readFileSync("components/v2/onboarding-shell.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");
    expect(screen).toContain("{backStep ? <div className=\"v2-card-back\"");
    expect(screen).not.toContain('backStep && step !== "complete"');
    expect(shell).toContain('className="v2-mobile-back"');
    expect(css).toMatch(/\.v2-card-back\s*\{[^}]*text-align:\s*center/);
    expect(css).toMatch(/\.v2-mobile-back\s*\{\s*display:\s*none/);
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.v2-card-back\s*\{\s*display:\s*none;\s*\}[\s\S]*?\.v2-mobile-back[^}]*display:\s*inline-flex/);
  });

  it("keeps the v2 workspace free of links to the legacy case surface", () => {
    const source = readFileSync("components/v2/assistant-workspace.tsx", "utf8");
    expect(source).not.toContain("/case/demo");
    expect(source).not.toContain("Review disruption");
  });

  it("contains the responsive and reduced-motion rules needed at 390px", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(/button:focus-visible,\s*a:focus-visible/);
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.v2-workspace\s*\{[^}]*width:\s*calc\(100% - 24px\)/);
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.v2-confirmation-card > header\s*\{\s*display:\s*grid/);
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.v2-action-fields,\s*\.v2-tracker-preview,\s*\.v2-message-preview > p\s*\{\s*margin-left:\s*0/);
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.v2-execution-card > ul > li[^}]*grid-template-columns:\s*22px 1fr/);
  });

  it("creates a standalone-useful Notion tracker without visible internal identifiers", async () => {
    const action: FollowThroughTrackerAction = {
      type: "NOTION_TRACKER_UPSERT",
      action_id: "tracker-action",
      idempotency_key: "tracker-idempotency",
      required: true,
      title: "Ripple · Protect board preparation",
      executive_summary: "Preparation time is exposed before the 19:30 board review.",
      decision_at: "2026-09-13T08:00:00.000Z",
      status: "PLANNED",
      chosen_decision: "Tuesday, 15 September — 19:30–20:30",
      impact: "Board preparation runs Monday 23:00–00:00.",
      next_deadline: "2026-09-14T08:00:00.000Z",
      last_updated_at: "2026-09-13T08:00:00.000Z",
      affected_commitments: [{ title: "Board review", time_label: "Monday morning", owner_label: "Calendar owner", impact: "Preparation time is tight.", chosen_response: "Protect preparation time." }],
      decisions: [
        { decision: "Protect the earliest opening.", decided_at: "2026-09-13T08:00:00.000Z" },
        { decision: "Existing meetings remain unchanged and must be reviewed manually.", decided_at: "2026-09-13T08:00:00.000Z" },
      ],
      tasks: [
        { task_id: "prepare", title: "Prepare briefing", owner_label: "Executive", due_at: "2026-09-14T08:00:00.000Z", timezone: "Europe/Berlin", status: "NOT_STARTED", source_action_id: "tracker-action" },
        { task_id: "review", title: "Review outcomes", owner_label: "Executive", due_at: "2026-09-14T08:45:00.000Z", timezone: "Europe/Berlin", status: "NOT_STARTED", source_action_id: "tracker-action" },
      ],
    };
    const context: WriteContext = { schema_version: "1.0", trace_id: "trace", case_id: "case-pm", case_version: 2, plan_id: "plan", plan_hash: "a".repeat(64), action_id: "tracker-action", idempotency_key: "tracker-idempotency", expected_snapshot_hash: "b".repeat(64), dry_run: false };
    let createdChildren: Array<Record<string, unknown>> = [];
    const create = vi.fn(async (input: { children: Array<Record<string, unknown>> }) => { createdChildren = input.children; return { id: "tracker-page" }; });
    const withPlainText = (block: Record<string, unknown>) => {
      const type = String(block.type);
      const body = block[type] as { rich_text?: Array<{ text?: { content?: string; link?: { url?: string } } }> } | undefined;
      return body?.rich_text ? { ...block, [type]: { ...body, rich_text: body.rich_text.map((part) => ({ ...part, plain_text: part.text?.content ?? "" })) } } : block;
    };
    const list = vi.fn(async ({ block_id }: { block_id: string }) => ({ results: block_id === "parent" ? [] : createdChildren.map(withPlainText), has_more: false, next_cursor: null }));
    const adapter = new NotionArtifactAdapter({ PROVIDER_MODE: "real", RIPPLE_OPERATOR_EMAIL: "operator@example.com", DEMO_STAKEHOLDER_EMAILS: "host@example.com", GOOGLE_CALENDAR_ID: "primary", GMAIL_INGEST_LABEL: "TravelCopilot/Test", OPENAI_MODEL: "gpt-5.6-terra", NOTION_ACCESS_TOKEN: "test-token", NOTION_PARENT_PAGE_ID: "parent", stakeholder_emails: ["host@example.com"] } satisfies ServerConfig);
    (adapter as unknown as { client: unknown }).client = { blocks: { children: { list, append: vi.fn() } }, pages: { create, retrieve: vi.fn(async () => ({ id: "tracker-page", url: "https://www.notion.so/tracker-page", last_edited_time: "2026-09-13T08:01:00.000Z" })) } };

    const result = await adapter.upsert_tracker(context, action);
    const encoded = JSON.stringify(createdChildren);
    const visibleText = createdChildren.flatMap((block) => {
      const type = String(block.type);
      const body = block[type] as { rich_text?: Array<{ text?: { content?: string } }> } | undefined;
      return (body?.rich_text ?? []).map((part) => part.text?.content ?? "").filter((value) => value !== "⁣");
    }).join("\n");
    expect(result).toMatchObject({ verified: true, external_url: "https://www.notion.so/tracker-page" });
    for (const heading of ["Week at a glance", "At a glance", "What changed", "Affected commitments", "Next actions", "Decision log"]) expect(visibleText).toContain(heading);
    for (const handoff of ["Latest commitment:", "Why it matters:", "Next checkpoint:", "Assistant handoff:"]) expect(visibleText).toContain(handoff);
    for (const field of ["Status:", "Chosen decision:", "Impact:", "Next deadline:", "Last updated:", "Owner:", "Due:", "Status: Not started", "reviewed manually"]) expect(visibleText).toContain(field);
    expect(visibleText).toContain("Tuesday, 15 September — evening 7:30 PM–8:30 PM");
    expect(visibleText).toContain("Monday night 11:00 PM–12:00 AM");
    expect(visibleText).toContain("Monday, September 14 morning at 10:00 AM (Europe/Berlin)");
    expect(visibleText).not.toMatch(/2026-09-\d{2}T/);
    expect(visibleText).not.toMatch(/\b(?:1[3-9]|2[0-3]):[0-5]\d\b/);
    expect(visibleText).not.toContain("Ripple tracker");
    expect(visibleText).not.toContain("Ripple task");
    expect(encoded).toContain("https://ripple.local/tracker/case-pm");
    expect(encoded).toContain("https://ripple.local/task/prepare");
    expect(encoded).toContain("https://ripple.local/task/review");
  });
});
