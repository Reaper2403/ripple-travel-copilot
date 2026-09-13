import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerConfig } from "../src/lib/config";
import type { ArtifactAction, CalendarAction, MailAction, WriteContext } from "../src/lib/domain/types";

const mocks = vi.hoisted(() => ({
  gmailFactory: vi.fn(),
  calendarFactory: vi.fn(),
  notionClient: {
    search: vi.fn(),
    pages: { create: vi.fn(), retrieve: vi.fn() },
    blocks: { children: { list: vi.fn() } },
  },
}));

vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    gmail: mocks.gmailFactory,
    calendar: mocks.calendarFactory,
  },
}));

vi.mock("@notionhq/client", () => ({ Client: class { constructor() { return mocks.notionClient; } } }));

import { GoogleCalendarAdapter, GoogleMailAdapter } from "../src/lib/adapters/google";
import { NotionArtifactAdapter } from "../src/lib/adapters/notion";

const config: ServerConfig = {
  PROVIDER_MODE: "real",
  RIPPLE_OPERATOR_EMAIL: "operator@example.com",
  DEMO_STAKEHOLDER_EMAILS: "stakeholder1@example.com,stakeholder2@example.com",
  stakeholder_emails: ["stakeholder1@example.com", "stakeholder2@example.com"],
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  GOOGLE_REDIRECT_URI: "http://localhost:3000/auth/google/callback",
  GOOGLE_REFRESH_TOKEN: "test-refresh",
  GOOGLE_CALENDAR_ID: "test-calendar",
  GMAIL_INGEST_LABEL: "RIPPLE/READY",
  NOTION_ACCESS_TOKEN: "test-notion",
  NOTION_PARENT_PAGE_ID: "parent-page-id",
  OPENAI_MODEL: "configured-model",
};

const context: WriteContext = {
  schema_version: "1.0", trace_id: "trace", case_id: "case", case_version: 4, plan_id: "plan",
  plan_hash: "a".repeat(64), action_id: "action", idempotency_key: "case:plan:action",
  expected_snapshot_hash: "b".repeat(64), dry_run: false,
};

const mail: MailAction = {
  type: "MAIL_SEND", action_id: "mail", idempotency_key: "mail-key", required: true,
  to: ["stakeholder1@example.com"], cc: [], bcc: [], subject: "Synthetic Ripple test", body_text: "Synthetic test body",
};

const calendar: CalendarAction = {
  type: "CALENDAR_HOLD_UPSERT", action_id: "calendar-action", idempotency_key: "calendar-key", required: true,
  title: "[RIPPLE TEST] hold", start_at: "2026-09-15T00:00:00.000Z", end_at: "2026-09-15T01:00:00.000Z",
  timezone: "America/Los_Angeles",
};

const artifact: ArtifactAction = {
  type: "ARTIFACT_UPSERT", action_id: "notion-action", idempotency_key: "notion-key", required: true,
  title: "[RIPPLE TEST] recovery brief", sections: [{ key: "test", heading: "Synthetic test", body_text: "No personal data." }],
};

beforeEach(() => vi.clearAllMocks());

describe("Gmail safety boundary", () => {
  it("rejects an unexpected recipient before constructing a provider request", async () => {
    const adapter = new GoogleMailAdapter(config);
    await expect(adapter.send(context, { ...mail, to: ["outside@example.com"] })).rejects.toMatchObject({
      detail: { category: "VALIDATION", retryable: false },
    });
    expect(mocks.gmailFactory).not.toHaveBeenCalled();
  });

  it("classifies a network loss after send invocation as unknown and non-retryable", async () => {
    const send = vi.fn().mockRejectedValue(new Error("connection reset"));
    mocks.gmailFactory.mockReturnValue({ users: { messages: { list: vi.fn().mockResolvedValue({ data: { messages: [] } }), send } } });
    const adapter = new GoogleMailAdapter(config);
    await expect(adapter.send(context, mail)).rejects.toMatchObject({
      detail: { category: "UNKNOWN_OUTCOME", retryable: false },
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("requires a provider message id before calling a send verified", async () => {
    mocks.gmailFactory.mockReturnValue({ users: { messages: { list: vi.fn().mockResolvedValue({ data: { messages: [] } }), send: vi.fn().mockResolvedValue({ data: {} }), get: vi.fn() } } });
    const result = await new GoogleMailAdapter(config).send(context, mail);
    expect(result.verified).toBe(false);
  });

  it("reconciles the deterministic message id without sending a duplicate", async () => {
    const send = vi.fn();
    mocks.gmailFactory.mockReturnValue({ users: { messages: { list: vi.fn().mockResolvedValue({ data: { messages: [{ id: "existing-message" }] } }), send } } });
    const result = await new GoogleMailAdapter(config).send(context, mail);
    expect(result).toMatchObject({ provider_ref: "existing-message", verified: true });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("Calendar crash-window reconciliation", () => {
  it("excludes cancelled, transparent, and all-day entries while preserving private busy time", async () => {
    mocks.calendarFactory.mockReturnValue({ events: { list: vi.fn().mockResolvedValue({ data: { items: [
      { id: "private", etag: "v1", summary: "Confidential title", visibility: "private", status: "confirmed", start: { dateTime: "2026-09-15T15:00:00Z" }, end: { dateTime: "2026-09-15T16:00:00Z" } },
      { id: "transparent", transparency: "transparent", start: { dateTime: "2026-09-15T16:00:00Z" }, end: { dateTime: "2026-09-15T17:00:00Z" } },
      { id: "cancelled", status: "cancelled", start: { dateTime: "2026-09-15T17:00:00Z" }, end: { dateTime: "2026-09-15T18:00:00Z" } },
      { id: "all-day", start: { date: "2026-09-15" }, end: { date: "2026-09-16" } },
      { id: "ripple-owned", extendedProperties: { private: { ripple_case_id: "demo" } }, start: { dateTime: "2026-09-15T18:00:00Z" }, end: { dateTime: "2026-09-15T19:00:00Z" } },
    ] } }) } });
    const snapshot = await new GoogleCalendarAdapter(config).snapshot({ start_at: "2026-09-15T00:00:00Z", end_at: "2026-09-16T00:00:00Z", timezone: "America/Los_Angeles" });
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]).toMatchObject({ event_ref: "private", visibility: "PRIVATE" });
  });

  it("finds an app-owned event by action id, patches it, and reads it back instead of inserting", async () => {
    const list = vi.fn().mockResolvedValue({ data: { items: [{ id: "existing-event", summary: "old" }] } });
    const patch = vi.fn().mockResolvedValue({ data: { id: "existing-event" } });
    const insert = vi.fn();
    const get = vi.fn().mockResolvedValue({ data: { id: "existing-event", etag: "v2", extendedProperties: { private: { ripple_action_id: "calendar-action", ripple_case_id: "case" } } } });
    mocks.calendarFactory.mockReturnValue({ events: { list, patch, insert, get } });
    const result = await new GoogleCalendarAdapter(config).apply({ ...context, action_id: "calendar-action" }, calendar);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ privateExtendedProperty: ["ripple_action_id=calendar-action"] }));
    expect(patch).toHaveBeenCalledWith(expect.objectContaining({ eventId: "existing-event" }));
    expect(insert).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ eventId: "existing-event" }));
    expect(result.verified).toBe(true);
  });

  it("does not claim verification when read-back ownership markers differ", async () => {
    mocks.calendarFactory.mockReturnValue({ events: {
      list: vi.fn().mockResolvedValue({ data: { items: [] } }),
      patch: vi.fn(),
      insert: vi.fn().mockResolvedValue({ data: { id: "new-event" } }),
      get: vi.fn().mockResolvedValue({ data: { id: "new-event", extendedProperties: { private: { ripple_action_id: "other" } } } }),
    } });
    const result = await new GoogleCalendarAdapter(config).apply({ ...context, action_id: "calendar-action" }, calendar);
    expect(result.verified).toBe(false);
  });
});

describe("Notion crash-window reconciliation", () => {
  it("reuses a page under the configured parent when its durable action marker exists", async () => {
    mocks.notionClient.search.mockResolvedValue({ results: [{ object: "page", id: "existing-page", parent: { type: "page_id", page_id: "parent-page-id" } }] });
    mocks.notionClient.blocks.children.list.mockResolvedValue({ results: [{ type: "paragraph", paragraph: { rich_text: [{ plain_text: "Ripple action notion-action" }] } }] });
    mocks.notionClient.pages.retrieve.mockResolvedValue({ id: "existing-page", last_edited_time: "2026-09-13T08:00:00.000Z" });
    const result = await new NotionArtifactAdapter(config).upsert_case_brief({ ...context, action_id: "notion-action" }, artifact);
    expect(mocks.notionClient.pages.create).not.toHaveBeenCalled();
    expect(mocks.notionClient.pages.retrieve).toHaveBeenCalledWith({ page_id: "existing-page" });
    expect(result).toMatchObject({ provider_ref: "existing-page", verified: true });
  });

  it("creates once and reads the resulting page back before verification", async () => {
    mocks.notionClient.search.mockResolvedValue({ results: [] });
    mocks.notionClient.pages.create.mockResolvedValue({ id: "created-page", last_edited_time: "2026-09-13T08:00:00.000Z" });
    mocks.notionClient.pages.retrieve.mockResolvedValue({ id: "created-page", last_edited_time: "2026-09-13T08:00:00.000Z" });
    const result = await new NotionArtifactAdapter(config).upsert_case_brief({ ...context, action_id: "notion-action" }, artifact);
    expect(mocks.notionClient.pages.create).toHaveBeenCalledTimes(1);
    expect(mocks.notionClient.pages.retrieve).toHaveBeenCalledWith({ page_id: "created-page" });
    expect(result.verified).toBe(true);
  });
});
