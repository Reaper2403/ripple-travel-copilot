import type { CalendarSnapshot, DisruptionFacts, ImpactAssessment } from "./types";

const RECOVERY_BUFFER_MS = 4 * 60 * 60 * 1000;

export function assessImpacts(facts: DisruptionFacts, calendar: CalendarSnapshot): ImpactAssessment[] {
  const arrival = facts.segments
    .map((segment) => segment.revised_end_at ?? segment.scheduled_end_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  if (!arrival) return [];
  const arrivalMs = Date.parse(arrival);
  const dangerEnd = arrivalMs + (facts.kind === "CANCELLATION" ? 12 * 60 * 60 * 1000 : RECOVERY_BUFFER_MS);

  return calendar.events
    .filter((event) => Date.parse(event.start_at) < dangerEnd && Date.parse(event.end_at) > arrivalMs - 60 * 60 * 1000)
    .map((event) => {
      const overlap = Date.parse(event.start_at) <= arrivalMs;
      return {
        event_ref: event.event_ref,
        event_title: event.visibility === "DEFAULT" ? event.title : "Busy commitment",
        severity: overlap ? "HIGH" : "MEDIUM",
        rule_id: overlap ? "ARRIVAL_OVERLAP_V1" : "POST_ARRIVAL_BUFFER_V1",
        reason: overlap
          ? "The revised arrival overlaps this commitment."
          : "This commitment begins inside the four-hour arrival recovery buffer.",
        conflict_window: { start_at: arrival, end_at: new Date(dangerEnd).toISOString() },
      } satisfies ImpactAssessment;
    });
}
