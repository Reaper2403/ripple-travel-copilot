import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { deterministicExtract } from "../src/lib/domain/extractor";
import { hash } from "../src/lib/domain/hash";
import { planRecovery } from "../src/lib/domain/planner";
import type { RecoveryCase } from "../src/lib/domain/types";
import { DEMO_MESSAGES } from "../src/lib/fixtures";

const contractDir = path.join(process.cwd(), "contracts");

async function validator(name: string) {
  const schema = JSON.parse(await readFile(path.join(contractDir, name), "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

describe("machine-readable schemas", () => {
  it("accepts grounded disruption facts and rejects extra executable fields", async () => {
    const validate = await validator("disruption-facts.schema.json");
    const facts = deterministicExtract(DEMO_MESSAGES.delay);
    expect(validate(facts), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...facts, recipient: "attacker@example.com" })).toBe(false);
    expect(validate({ ...facts, case_confidence: 1.2 })).toBe(false);
  });

  it("accepts the exact three-action manifest and rejects malformed mail", async () => {
    const validate = await validator("action-manifest.schema.json");
    const source = DEMO_MESSAGES.delay;
    const caseData: RecoveryCase = {
      schema_version: "1.0", case_id: "schema-case", version: 2, status: "READY_FOR_REVIEW",
      source, source_snapshot_hash: hash(source), facts: deterministicExtract(source), impacts: [], plans: [],
      created_at: source.received_at, updated_at: source.received_at,
    };
    const manifest = planRecovery(caseData, ["stakeholder1@example.com"])[0].manifest;
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    const invalid = structuredClone(manifest);
    const mail = invalid.actions.find((action) => action.type === "MAIL_SEND");
    if (!mail || mail.type !== "MAIL_SEND") throw new Error("mail fixture missing");
    mail.to = ["not-an-email"];
    expect(validate(invalid)).toBe(false);
  });

  it("rejects approvals with short nonces and receipts with invalid hashes", async () => {
    const approval = await validator("approval-grant.schema.json");
    const receipt = await validator("execution-receipt.schema.json");
    const h = "a".repeat(64);
    const baseApproval = {
      schema_version: "1.0", approval_id: "approval-1", actor_id: "operator@example.com", case_id: "case-1",
      case_version: 2, plan_id: "plan-1", plan_hash: h, manifest_hash: h, source_snapshot_hash: h,
      calendar_snapshot_hash: h, issued_at: "2026-09-13T08:00:00.000Z", expires_at: "2026-09-13T08:15:00.000Z", nonce: "1234567890123456",
    };
    expect(approval(baseApproval), JSON.stringify(approval.errors)).toBe(true);
    expect(approval({ ...baseApproval, nonce: "short" })).toBe(false);
    const baseReceipt = {
      schema_version: "1.0", trace_id: "trace", case_id: "case-1", action_id: "action-1", plan_hash: h,
      connector: "ARTIFACT", operation: "upsert", idempotency_key: "idem", attempt: 1, status: "PLANNED",
      request_fingerprint: "request-hash", started_at: "2026-09-13T08:00:00.000Z", evidence_refs: [],
    };
    expect(receipt(baseReceipt), JSON.stringify(receipt.errors)).toBe(true);
    expect(receipt({ ...baseReceipt, plan_hash: "bad" })).toBe(false);
  });
});
