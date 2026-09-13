import { AdapterError } from "../domain/errors";
import { hash } from "../domain/hash";
import type { ArtifactAction, CalendarAction, MailAction, ProviderWriteResult, SourceMessage, WriteContext } from "../domain/types";
import { DEMO_EVENTS, DEMO_MESSAGES } from "../fixtures";
import type { ProviderPorts } from "../ports";

export interface FakeFaults {
  action_type?: ArtifactAction["type"] | CalendarAction["type"] | MailAction["type"];
  category?: "AUTH" | "TRANSIENT" | "UNKNOWN_OUTCOME";
}

export class FakeProviders implements ProviderPorts {
  readonly writes = new Map<string, ProviderWriteResult>();
  constructor(private readonly faults: FakeFaults = {}) {}

  mail_reader = {
    scan: async () => ({ message_ids: [DEMO_MESSAGES.delay.message_id] }),
    get_message: async ({ message_id }: { message_id: string }): Promise<SourceMessage> => {
      const match = Object.values(DEMO_MESSAGES).find((item) => item.message_id === message_id);
      if (!match) throw new AdapterError({ category: "PERMANENT", retryable: false, safe_message: "Fixture message was not found." });
      return structuredClone(match);
    },
  };

  calendar_reader = {
    snapshot: async (input: { start_at: string; end_at: string; timezone: string }) => {
      const base = {
        captured_at: "2026-09-13T08:01:00.000Z",
        start_at: input.start_at,
        end_at: input.end_at,
        timezone: input.timezone,
        complete: true,
        events: structuredClone(DEMO_EVENTS),
      };
      return { ...base, snapshot_hash: hash({ ...base, captured_at: undefined }) };
    },
  };

  private write(context: WriteContext, type: string, body: unknown): ProviderWriteResult {
    validateContext(context);
    const previous = this.writes.get(context.idempotency_key);
    if (previous) return previous;
    if (this.faults.action_type === type) {
      const category = this.faults.category ?? "TRANSIENT";
      throw new AdapterError({
        category,
        retryable: category === "TRANSIENT",
        safe_message: category === "UNKNOWN_OUTCOME" ? "Provider outcome is unknown; manual reconciliation is required." : "Scripted provider failure.",
      });
    }
    const result: ProviderWriteResult = {
      outcome: "SUCCEEDED",
      provider_ref: `fake-${type.toLowerCase()}-${hash(body).slice(0, 10)}`,
      provider_version: "fake-v1",
      verified: true,
      before_hash: null,
      after_hash: hash(body),
      completed_at: new Date().toISOString(),
    };
    this.writes.set(context.idempotency_key, result);
    return result;
  }

  artifact_writer = {
    upsert_case_brief: async (context: WriteContext, action: ArtifactAction) => this.write(context, action.type, action),
  };
  calendar_writer = {
    apply: async (context: WriteContext, action: CalendarAction) => this.write(context, action.type, action),
  };
  mail_writer = {
    send: async (context: WriteContext, action: MailAction) => this.write(context, action.type, action),
  };
}

export function validateContext(context: WriteContext): void {
  if (
    context.schema_version !== "1.0" ||
    !context.trace_id ||
    !context.case_id ||
    !context.plan_id ||
    !/^[a-f0-9]{64}$/.test(context.plan_hash) ||
    !context.action_id ||
    !context.idempotency_key ||
    !/^[a-f0-9]{64}$/.test(context.expected_snapshot_hash)
  ) {
    throw new AdapterError({ category: "VALIDATION", retryable: false, safe_message: "The provider write context is invalid." });
  }
}
