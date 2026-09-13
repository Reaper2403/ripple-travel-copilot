import { hash } from "./domain/hash";
import type { CalendarEventSnapshot, SourceMessage } from "./domain/types";

function source(message_id: string, subject: string, body_text: string): SourceMessage {
  const base = {
    message_id,
    thread_id: `thread-${message_id}`,
    source_version: "fixture-v1",
    received_at: "2026-09-13T08:00:00.000Z",
    from: "alerts@northstar-air.example",
    subject,
    body_text,
  };
  return { ...base, content_hash: hash(base) };
}

export const DEMO_MESSAGES = {
  delay: source(
    "demo-delay",
    "Important: NS 442 arrival delayed",
    "Northstar Air flight NS 442 from Berlin (BER) to San Francisco (SFO) on 14 September 2026 is delayed. Original departure 08:00 CEST and arrival 11:00 PDT. Revised departure 14:00 CEST and arrival 17:00 PDT. Booking RPL123.",
  ),
  cancellation: source(
    "demo-cancel",
    "Cancelled: NS 442 to San Francisco",
    "Northstar Air flight NS 442 from Berlin to San Francisco on 14 September 2026 has been cancelled. It was scheduled to depart at 08:00 CEST and arrive at 11:00 PDT. Contact the airline for alternatives. This is a synthetic demo notice.",
  ),
  ambiguous: source(
    "demo-ambiguous",
    "Possible change to your trip",
    "Your upcoming journey may have changed. Check the airline app for current details.",
  ),
} satisfies Record<string, SourceMessage>;

export const DEMO_EVENTS: CalendarEventSnapshot[] = [
  {
    event_ref: "event-investor-dinner",
    provider_version: "etag-1",
    title: "Investor dinner",
    start_at: "2026-09-14T21:00:00.000Z",
    end_at: "2026-09-14T22:00:00.000Z",
    timezone: "America/Los_Angeles",
    attendees: ["operator@example.com", "stakeholder1@example.com"],
    organizer: "stakeholder1@example.com",
    owned_by_operator: false,
    visibility: "DEFAULT",
  },
  {
    event_ref: "event-team-review",
    provider_version: "etag-2",
    title: "Team launch review",
    start_at: "2026-09-14T23:00:00.000Z",
    end_at: "2026-09-15T00:00:00.000Z",
    timezone: "America/Los_Angeles",
    attendees: ["operator@example.com", "stakeholder2@example.com"],
    organizer: "operator@example.com",
    owned_by_operator: true,
    visibility: "DEFAULT",
  },
];
