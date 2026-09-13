import type { CalendarSnapshot, SourceMessage } from "../domain/types";
import type { CalendarReaderPort, MailReaderPort } from "../ports";
import { getServerConfig } from "../config";
import { GoogleCalendarAdapter, GoogleMailAdapter } from "../adapters/google";
import { FakeProviders } from "../adapters/fake";

export interface ReadContextPorts {
  calendar: Pick<CalendarReaderPort, "snapshot">;
  mail: Pick<MailReaderPort, "scan" | "get_message">;
}

export type ReadContextFactory = (calendarId: string) => ReadContextPorts;

const fake = new FakeProviders();

export const createReadContext: ReadContextFactory = (calendarId) => {
  const config = getServerConfig();
  if (config.PROVIDER_MODE !== "real") {
    return Object.freeze({
      calendar: Object.freeze({ snapshot: fake.calendar_reader.snapshot }),
      mail: Object.freeze({ scan: fake.mail_reader.scan, get_message: fake.mail_reader.get_message }),
    });
  }
  const scoped = { ...config, GOOGLE_CALENDAR_ID: calendarId };
  const calendar = new GoogleCalendarAdapter(scoped);
  const mail = new GoogleMailAdapter(scoped);
  // Facades deliberately omit every writer method from the runtime object.
  return Object.freeze({
    calendar: Object.freeze({ snapshot: calendar.snapshot.bind(calendar) }),
    mail: Object.freeze({ scan: mail.scan.bind(mail), get_message: mail.get_message.bind(mail) }),
  });
};

export interface SafeRecentNotice {
  message_ref: string;
  sender_email?: string;
  subject: string;
  received_at: string;
  excerpt: string;
}

export function safeNotice(source: SourceMessage, messageRef: string): SafeRecentNotice {
  const sender = source.from.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? source.from.match(/\b[^\s<>@]+@[^\s<>@]+\b/)?.[0];
  return {
    message_ref: messageRef,
    sender_email: sender?.toLowerCase(),
    subject: source.subject.replace(/\s+/g, " ").trim().slice(0, 160),
    received_at: source.received_at,
    excerpt: source.body_text.replace(/\s+/g, " ").trim().slice(0, 1200),
  };
}

export function privacyFilteredSnapshot(snapshot: CalendarSnapshot): CalendarSnapshot {
  return {
    ...snapshot,
    events: snapshot.events.map((event) => ({
      ...event,
      title: event.visibility === "DEFAULT" ? event.title.slice(0, 160) : "Private commitment",
      attendees: [],
      organizer: undefined,
    })),
  };
}
