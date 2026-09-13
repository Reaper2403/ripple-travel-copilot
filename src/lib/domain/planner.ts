import { hash } from "./hash";
import type { ActionManifest, PlannedAction, RecoveryCase, RecoveryPlan } from "./types";

function arrival(caseData: RecoveryCase): string {
  return (
    caseData.facts?.segments
      .map((segment) => segment.revised_end_at ?? segment.scheduled_end_at)
      .filter((item): item is string => Boolean(item))
      .sort()
      .at(-1) ?? "2026-09-15T00:00:00.000Z"
  );
}

function buildPlan(
  caseData: RecoveryCase,
  index: number,
  strategy: RecoveryPlan["strategy"],
  title: string,
  summary: string,
  recipients: string[],
): RecoveryPlan {
  const plan_id = `${caseData.case_id}-plan-${index}`;
  const service = caseData.facts?.segments.find((segment) => segment.service_number)?.service_number ?? "travel disruption";
  const start = arrival(caseData);
  const end = new Date(Date.parse(start) + (strategy === "REMOTE_FIRST" ? 4 : 2) * 60 * 60 * 1000).toISOString();
  const actions: PlannedAction[] = [
    {
      type: "ARTIFACT_UPSERT",
      action_id: `${plan_id}-artifact`,
      idempotency_key: `${plan_id}:artifact`,
      required: true,
      title: `Recovery brief · ${service}`,
      sections: [
        { key: "situation", heading: "Situation", body_text: summary },
        {
          key: "impact",
          heading: "Commitments at risk",
          body_text: caseData.impacts.length
            ? caseData.impacts.map((impact) => `• ${impact.event_title}: ${impact.reason}`).join("\n")
            : "No downstream commitments are currently at risk.",
        },
        { key: "next_steps", heading: "Approved next steps", body_text: "Protect recovery time and notify the reviewed stakeholders." },
      ],
    },
    {
      type: "CALENDAR_HOLD_UPSERT",
      action_id: `${plan_id}-calendar`,
      idempotency_key: `${plan_id}:calendar`,
      required: true,
      title: `Travel recovery buffer · ${service}`,
      description: "Agent-owned recovery hold. Existing meetings are not changed.",
      start_at: start,
      end_at: end,
      timezone: "America/Los_Angeles",
    },
    ...(recipients.length
      ? [
          {
            type: "MAIL_SEND" as const,
            action_id: `${plan_id}-mail`,
            idempotency_key: `${plan_id}:mail`,
            required: true,
            to: recipients,
            cc: [],
            bcc: [],
            subject: "Travel disruption may affect my arrival",
            body_text:
              "My flight arrival has moved and may affect our upcoming commitment. I have protected recovery time and will confirm as soon as the itinerary stabilizes.",
          },
        ]
      : []),
  ];
  const manifestBase = {
    schema_version: "1.0" as const,
    case_id: caseData.case_id,
    case_version: caseData.version,
    plan_id,
    actions,
  };
  const manifest: ActionManifest = { ...manifestBase, manifest_hash: hash(manifestBase) };
  const planBase = {
    plan_id,
    version: 1,
    strategy,
    title,
    summary,
    rank: index,
    assumptions: ["The revised arrival in the source message is authoritative.", "No existing meeting will be modified automatically."],
    rationale: strategy === "REMOTE_FIRST" ? ["Protects the affected commitments with a remote-first coordination plan.", "Adds a four-hour recovery buffer."] : ["Notifies stakeholders while leaving commitments unchanged."],
    manifest,
  };
  return { ...planBase, plan_hash: hash(planBase) };
}

export function planRecovery(caseData: RecoveryCase, recipients: string[]): RecoveryPlan[] {
  return [
    buildPlan(caseData, 1, "REMOTE_FIRST", "Remote-first recovery", "Protect both commitments with a remote-first coordination plan and a four-hour recovery hold.", recipients),
    buildPlan(caseData, 2, "NOTIFY_ONLY", "Notify only", "Keep existing commitments unchanged, add a short disruption hold, and notify reviewed stakeholders.", recipients),
  ];
}
