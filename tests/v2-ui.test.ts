import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExecutionResult } from "../components/v2/action-confirmation-card";
import { askAssistant, confirmProposalGate, proposalApi } from "../components/v2/client";
import { backStepFor, connectionStatusLabel, isConnectionCurrent, stepPath } from "../components/v2/copy";
import { canExecuteProposal, executionPresentationState, insightKey, proposalPresentationState, receiptViews, safeReceiptLink } from "../components/v2/proposal-view";

describe("v2 product UI contracts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps every canonical setup step to a stable product route", () => {
    expect(stepPath("account")).toBe("/welcome");
    expect(stepPath("gmail")).toBe("/setup/email");
    expect(stepPath("calendar")).toBe("/setup/calendar");
    expect(stepPath("notion")).toBe("/setup/knowledge");
    expect(stepPath("complete")).toBe("/setup/complete");
    expect(stepPath("workspace")).toBe("/workspace");
    expect(backStepFor("complete")).toBe("notion");
    expect(backStepFor("gmail")).toBe("account");
  });

  it("never labels an unverified provider as connected", () => {
    expect(connectionStatusLabel("not_started", "real")).toBe("Not checked");
    expect(connectionStatusLabel("verifying", "real")).toBe("Checking connection");
    expect(connectionStatusLabel("needs_attention", "real")).toBe("Needs attention");
    expect(connectionStatusLabel("verified", "real")).toBe("Connected");
    expect(connectionStatusLabel("verified", "fixture")).toBe("Demo connection ready");
  });

  it("gives repeated insight labels distinct React keys", () => {
    const first = insightKey({ label: "Overlapping commitments", value: "Two conflicts" }, 0);
    const second = insightKey({ label: "Overlapping commitments", value: "Another conflict" }, 1);
    expect(first).not.toBe(second);
  });

  it("treats expired verification as requiring another check", () => {
    const now = Date.parse("2026-09-13T12:00:00.000Z");
    expect(isConnectionCurrent({ status: "verified", valid_until: "2026-09-13T12:01:00.000Z" }, now)).toBe(true);
    expect(isConnectionCurrent({ status: "verified", valid_until: "2026-09-13T11:59:00.000Z" }, now)).toBe(false);
    expect(isConnectionCurrent({ status: "needs_attention", valid_until: "2026-09-13T12:01:00.000Z" }, now)).toBe(false);
  });

  it("keeps the approval explanation read-only without a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await askAssistant("Show me how approval works.", "approval_demo");
    expect(result.reply.readOnly).toBe(true);
    expect(result.reply.summary).toContain("separate confirmation card");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not hide real assistant failures behind demo content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ safe_message: "Calendar is temporarily unavailable." }) }));
    await expect(askAssistant("Prepare my week.", "prepare_week")).rejects.toEqual(expect.objectContaining({ message: "Calendar is temporarily unavailable.", status: 503 }));
  });

  it("never re-enables confirmation for terminal or uncertain proposal states", () => {
    expect(proposalPresentationState("COMPLETED")).toBe("complete");
    expect(proposalPresentationState("PARTIALLY_COMPLETED")).toBe("partial");
    expect(proposalPresentationState("NEEDS_MANUAL_REVIEW")).toBe("manual");
    expect(proposalPresentationState("APPROVED")).toBe("approved");
    expect(executionPresentationState("COMPLETED")).toBe("complete");
    expect(executionPresentationState("NEEDS_MANUAL_REVIEW")).toBe("manual");
  });

  it("executes only an explicitly approved confirmation response", () => {
    expect(canExecuteProposal("APPROVED")).toBe(true);
    expect(canExecuteProposal("INVALIDATED")).toBe(false);
    expect(canExecuteProposal("READY_FOR_REVIEW")).toBe(false);
    expect(canExecuteProposal("COMPLETED")).toBe(false);
    expect(canExecuteProposal("NEEDS_MANUAL_REVIEW")).toBe(false);
  });

  it("treats an HTTP 200 invalidated confirmation as zero-write stale state", async () => {
    const invalidatedView = { proposals: [{ proposal_id: "proposal-stale", status: "INVALIDATED" }] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => invalidatedView });
    vi.stubGlobal("fetch", fetchMock);
    const gate = await confirmProposalGate({ proposalId: "proposal-stale", expectedVersion: 2, proposalHash: "a".repeat(64), manifestHash: "b".repeat(64) });
    expect(gate.approved).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v2/proposals/proposal-stale/confirm");
  });

  it("renders only validated HTTPS provider destinations as links", () => {
    expect(safeReceiptLink("https://calendar.google.com/event?eid=safe")).toContain("https://calendar.google.com/");
    expect(safeReceiptLink("http://notion.so/unsafe")).toBeUndefined();
    expect(safeReceiptLink("javascript:alert(1)")).toBeUndefined();
    expect(safeReceiptLink("not a url")).toBeUndefined();
  });

  it("submits only opaque proposal references during selection and confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    await proposalApi.select("proposal-1", 3, "alternative-1");
    await proposalApi.confirm("proposal-1", 4, "a".repeat(64), "b".repeat(64));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ expected_version: 3, alternative_id: "alternative-1" });
    const confirmation = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(confirmation).toEqual({ expected_version: 4, proposal_hash: "a".repeat(64), manifest_hash: "b".repeat(64) });
    expect(confirmation).not.toHaveProperty("actions");
  });

  it("does not infer a verified result from an unverified provider receipt", () => {
    const manifest = { proposalId: "proposal-1", version: 1, proposalHash: "a".repeat(64), manifestHash: "b".repeat(64), expiresAt: "2026-09-13T12:00:00.000Z", assumptions: [], actions: [{ id: "calendar-1", provider: "calendar" as const, title: "Executive preparation", calendar: "Primary", start: "Mon, Sep 14, 9:00 AM", end: "9:45 AM", timezone: "Europe/Berlin", attendees: [] }] };
    const result = receiptViews([{ action_id: "calendar-1", connector: "CALENDAR", operation: "upsert", status: "SUCCEEDED" }], manifest);
    expect(result[0].status).toBe("unknown");
    expect(result[0].link).toBeUndefined();
  });

  it("renders Open in Calendar only for a verified HTTPS receipt link", () => {
    const verified = renderToStaticMarkup(createElement(ExecutionResult, { status: "complete", receipts: [{ id: "calendar-1", provider: "calendar", label: "Executive preparation", status: "verified", detail: "Confirmed by the connected app.", link: "https://calendar.google.com/calendar/event?eid=safe" }] }));
    expect(verified).toContain("Open in Calendar");
    expect(verified).toContain("https://calendar.google.com/calendar/event?eid=safe");
    const absent = renderToStaticMarkup(createElement(ExecutionResult, { status: "complete", receipts: [{ id: "calendar-1", provider: "calendar", label: "Executive preparation", status: "verified", detail: "Confirmed by the connected app." }] }));
    expect(absent).not.toContain("Open in Calendar");
  });

  it("does not expose the legacy case route from v2 workspace navigation", () => {
    const source = readFileSync("components/v2/assistant-workspace.tsx", "utf8");
    expect(source).not.toContain("/case/demo");
  });
});
