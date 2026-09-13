import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import { AdapterError } from "../domain/errors";
import { hash } from "../domain/hash";
import type { CalendarAction, CalendarSnapshot, MailAction, ProviderWriteResult, SourceMessage, WriteContext } from "../domain/types";
import type { CalendarReaderPort, CalendarWriterPort, MailReaderPort, MailWriterPort } from "../ports";
import type { ServerConfig } from "../config";
import { validateContext } from "./fake";

function oauth(config: ServerConfig) {
  const client = new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, config.GOOGLE_REDIRECT_URI);
  client.setCredentials({ refresh_token: config.GOOGLE_REFRESH_TOKEN });
  return client;
}

function decode(data?: string | null): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function plainBody(part: { mimeType?: string | null; body?: { data?: string | null }; parts?: unknown[] }): string {
  if (part.mimeType === "text/plain") return decode(part.body?.data);
  return ((part.parts ?? []) as typeof part[]).map(plainBody).filter(Boolean).join("\n");
}

function normalizeError(error: unknown): AdapterError {
  if (error instanceof AdapterError) return error;
  const status = Number((error as { code?: unknown }).code ?? (error as { response?: { status?: unknown } }).response?.status ?? 0);
  const category = status === 401 ? "AUTH" : status === 403 ? "PERMISSION" : status === 409 || status === 412 ? "CONFLICT" : status === 429 ? "RATE_LIMIT" : status >= 500 ? "TRANSIENT" : "PERMANENT";
  return new AdapterError({ category, provider_code: status ? String(status) : undefined, retryable: category === "RATE_LIMIT" || category === "TRANSIENT", safe_message: "A Google service request could not be completed." });
}

function safeCalendarUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const allowed = url.hostname === "calendar.google.com" || (url.hostname === "www.google.com" && url.pathname.startsWith("/calendar/"));
    return url.protocol === "https:" && allowed ? url.toString() : undefined;
  } catch { return undefined; }
}

export class GoogleMailAdapter implements MailReaderPort, MailWriterPort {
  constructor(private readonly config: ServerConfig) {}
  async scan(input: { label: string; limit: number }): Promise<{ message_ids: string[] }> {
    try {
      const gmail = google.gmail({ version: "v1", auth: oauth(this.config) });
      const label = input.label.replace(/["\\]/g, "");
      const result = await gmail.users.messages.list({ userId: "me", q: `label:\"${label}\"`, maxResults: Math.min(Math.max(input.limit, 1), 20) });
      return { message_ids: (result.data.messages ?? []).map((message) => message.id).filter((id): id is string => Boolean(id)) };
    } catch (error) { throw normalizeError(error); }
  }
  async get_message({ message_id }: { message_id: string }): Promise<SourceMessage> {
    try {
      const gmail = google.gmail({ version: "v1", auth: oauth(this.config) });
      const result = await gmail.users.messages.get({ userId: "me", id: message_id, format: "full" });
      const headers = Object.fromEntries((result.data.payload?.headers ?? []).map((header) => [header.name?.toLowerCase(), header.value ?? ""]));
      const base = {
        message_id,
        thread_id: result.data.threadId ?? message_id,
        source_version: result.data.historyId ?? hash(result.data),
        received_at: new Date(Number(result.data.internalDate ?? Date.now())).toISOString(),
        from: headers["reply-to"] || headers.from || "",
        subject: headers.subject ?? "",
        body_text: plainBody(result.data.payload ?? {}),
      };
      return { ...base, content_hash: hash(base) };
    } catch (error) {
      throw normalizeError(error);
    }
  }

  async send(context: WriteContext, action: MailAction): Promise<ProviderWriteResult> {
    validateContext(context);
    const allowed = new Set([this.config.RIPPLE_OPERATOR_EMAIL, ...this.config.stakeholder_emails].map((item) => item.toLowerCase()));
    if (action.bcc.length || [...action.to, ...action.cc].some((address) => !allowed.has(address.toLowerCase()))) {
      throw new AdapterError({ category: "VALIDATION", retryable: false, safe_message: "A recipient is outside the configured demo allowlist." });
    }
    const deterministicMessageId = `ripple.${hash(action.idempotency_key).slice(0, 32)}@ripple.local`;
    const mime = [
      `To: ${action.to.join(", ")}`,
      ...(action.cc.length ? [`Cc: ${action.cc.join(", ")}`] : []),
      `Subject: ${action.subject}`,
      `Message-ID: <${deterministicMessageId}>`,
      "Content-Type: text/plain; charset=UTF-8",
      `X-Ripple-Action-ID: ${action.action_id}`,
      "",
      action.body_text,
    ].join("\r\n");
    try {
      const gmail = google.gmail({ version: "v1", auth: oauth(this.config) });
      const existing = await gmail.users.messages.list({ userId: "me", q: `rfc822msgid:${deterministicMessageId}`, maxResults: 2 });
      const existingId = existing.data.messages?.[0]?.id;
      if (existingId) {
        return { outcome: "SUCCEEDED", provider_ref: existingId, provider_version: "reconciled", verified: true, before_hash: hash(action), after_hash: hash(action), completed_at: new Date().toISOString() };
      }
      const sent = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: Buffer.from(mime).toString("base64url") },
      });
      const completed_at = new Date().toISOString();
      const sentId = sent.data.id;
      const verified = sentId ? await gmail.users.messages.get({ userId: "me", id: sentId, format: "metadata", metadataHeaders: ["Message-ID"] }) : undefined;
      return { outcome: "SUCCEEDED", provider_ref: sentId ?? action.action_id, provider_version: sent.data.historyId ?? "unknown", verified: Boolean(sentId && verified?.data.id === sentId), before_hash: null, after_hash: hash(action), completed_at };
    } catch (error) {
      // Network errors after transmission cannot be proven safe to retry.
      if (!(error as { response?: unknown }).response) {
        throw new AdapterError({ category: "UNKNOWN_OUTCOME", retryable: false, safe_message: "Gmail did not confirm whether the message was sent." });
      }
      throw normalizeError(error);
    }
  }
}

export class GoogleCalendarAdapter implements CalendarReaderPort, CalendarWriterPort {
  constructor(private readonly config: ServerConfig) {}
  async snapshot(input: { start_at: string; end_at: string; timezone: string }): Promise<CalendarSnapshot> {
    try {
      const calendar = google.calendar({ version: "v3", auth: oauth(this.config) });
      const sources = [
        { calendarId: "primary", source: "PRIMARY" as const },
        { calendarId: this.config.GOOGLE_CALENDAR_ID, source: "SELECTED" as const },
      ];
      const results = await Promise.all(sources.map(async (source) => ({
        ...source,
        result: await calendar.events.list({ calendarId: source.calendarId, timeMin: input.start_at, timeMax: input.end_at, singleEvents: true, maxResults: 250, timeZone: input.timezone }),
      })));
      const deduplicated = new Map<string, { event: calendar_v3.Schema$Event; source: "PRIMARY" | "SELECTED" }>();
      for (const { result, source } of results) for (const event of result.data.items ?? []) {
        const occurrence = event.originalStartTime?.dateTime ?? event.start?.dateTime ?? event.originalStartTime?.date ?? event.start?.date ?? "";
        const key = `${event.iCalUID ?? event.id ?? hash(event)}:${occurrence}`;
        if (!deduplicated.has(key)) deduplicated.set(key, { event, source });
      }
      const events = [...deduplicated.values()]
        // Ripple-created holds are still real busy time. Excluding them here lets
        // later plans collide with earlier confirmed changes.
        .filter(({ event }) => event.status !== "cancelled" && event.transparency !== "transparent" && event.attendees?.find((attendee) => attendee.self)?.responseStatus !== "declined" && event.start?.dateTime && event.end?.dateTime)
        .map(({ event, source }) => ({
        event_ref: event.id ?? hash(event), provider_version: event.etag ?? "unknown", title: event.summary ?? "Busy commitment",
        source_calendar: source,
        start_at: new Date(event.start!.dateTime!).toISOString(), end_at: new Date(event.end!.dateTime!).toISOString(),
        timezone: event.start?.timeZone ?? input.timezone, attendees: (event.attendees ?? []).map((a) => a.email).filter((a): a is string => Boolean(a)),
        organizer: event.organizer?.email ?? undefined, owned_by_operator: event.organizer?.self ?? false,
        visibility: event.visibility === "private" || event.visibility === "confidential" ? "PRIVATE" as const : "DEFAULT" as const,
      }));
      const base = { captured_at: new Date().toISOString(), start_at: input.start_at, end_at: input.end_at, timezone: input.timezone, complete: results.every(({ result }) => !result.data.nextPageToken), events: events.sort((a, b) => `${a.source_calendar}:${a.event_ref}`.localeCompare(`${b.source_calendar}:${b.event_ref}`)) };
      return { ...base, snapshot_hash: hash({ ...base, captured_at: undefined }) };
    } catch (error) { throw normalizeError(error); }
  }

  async apply(context: WriteContext, action: CalendarAction): Promise<ProviderWriteResult> {
    validateContext(context);
    try {
      const calendar = google.calendar({ version: "v3", auth: oauth(this.config) });
      const emailInvitee = action.email_request?.sender_email.toLowerCase() === this.config.RIPPLE_OPERATOR_EMAIL.toLowerCase() ? undefined : action.email_request?.sender_email;
      const invitee = action.proposal_for?.organizer_email ?? emailInvitee;
      let targetCalendarId = this.config.GOOGLE_CALENDAR_ID;
      let ownedSource: calendar_v3.Schema$Event | undefined;
      if (action.reschedule_owned) {
        targetCalendarId = action.reschedule_owned.source_calendar === "PRIMARY" ? "primary" : this.config.GOOGLE_CALENDAR_ID;
        const source = await calendar.events.get({ calendarId: targetCalendarId, eventId: action.reschedule_owned.event_ref });
        ownedSource = source.data;
        if (ownedSource.status === "cancelled") throw new AdapterError({ category: "CONFLICT", retryable: false, safe_message: "The meeting was cancelled before Ripple could move it." });
        if (!ownedSource.organizer?.self) throw new AdapterError({ category: "VALIDATION", retryable: false, safe_message: "Ripple can only move an existing meeting when you are its organizer." });
        if (action.reschedule_owned.expected_version !== "unknown" && ownedSource.etag !== action.reschedule_owned.expected_version) throw new AdapterError({ category: "CONFLICT", retryable: false, safe_message: "The meeting changed after review. Ask Ripple to refresh the proposal." });
      }
      if (action.proposal_for) {
        const sourceCalendarId = action.proposal_for.source_calendar === "PRIMARY" ? "primary" : this.config.GOOGLE_CALENDAR_ID;
        const source = await calendar.events.get({ calendarId: sourceCalendarId, eventId: action.proposal_for.event_ref });
        const organizer = source.data.organizer;
        if (source.data.status === "cancelled") throw new AdapterError({ category: "CONFLICT", retryable: false, safe_message: "The original invitation was cancelled before Ripple could send the proposed time." });
        if (organizer?.self) throw new AdapterError({ category: "VALIDATION", retryable: false, safe_message: "This meeting is owned by you and does not require a guest proposal." });
        if (!organizer?.email || organizer.email.toLowerCase() !== action.proposal_for.organizer_email.toLowerCase()) throw new AdapterError({ category: "CONFLICT", retryable: false, safe_message: "The meeting organizer changed. Review the proposal again before sending it." });
      }
      const requestBody = {
        ...(action.reschedule_owned ? {} : { summary: action.title, description: action.description }),
        start: { dateTime: action.start_at, timeZone: action.timezone },
        end: { dateTime: action.end_at, timeZone: action.timezone },
        ...(invitee ? { attendees: [{ email: invitee }] } : {}),
        extendedProperties: { private: { ...(ownedSource?.extendedProperties?.private ?? {}), ripple_case_id: context.case_id, ripple_action_id: context.action_id } },
      };
      let eventId = action.reschedule_owned?.event_ref ?? action.event_ref;
      let beforeHash: string | null = ownedSource ? hash(ownedSource) : null;
      if (!eventId) {
        const existing = await calendar.events.list({
          calendarId: this.config.GOOGLE_CALENDAR_ID,
          privateExtendedProperty: [`ripple_action_id=${context.action_id}`],
          maxResults: 2,
          singleEvents: true,
        });
        eventId = existing.data.items?.[0]?.id ?? undefined;
        if (eventId) beforeHash = hash(existing.data.items?.[0]);
      }
      const notifyAttendees = Boolean(action.reschedule_owned && ownedSource?.attendees?.length);
      const result = eventId
        ? await calendar.events.patch({ calendarId: targetCalendarId, eventId, sendUpdates: notifyAttendees ? "all" : "none", requestBody })
        : await calendar.events.insert({ calendarId: this.config.GOOGLE_CALENDAR_ID, sendUpdates: invitee ? "all" : "none", requestBody });
      const providerRef = result.data.id ?? eventId ?? action.action_id;
      const verified = await calendar.events.get({ calendarId: targetCalendarId, eventId: providerRef });
      const metadata = verified.data.extendedProperties?.private;
      const timeVerified = !action.reschedule_owned || (
        verified.data.start?.dateTime && verified.data.end?.dateTime
        && new Date(verified.data.start.dateTime).toISOString() === new Date(action.start_at).toISOString()
        && new Date(verified.data.end.dateTime).toISOString() === new Date(action.end_at).toISOString()
      );
      const isVerified = Boolean(verified.data.id === providerRef && metadata?.ripple_action_id === context.action_id && metadata?.ripple_case_id === context.case_id && timeVerified);
      return { outcome: "SUCCEEDED", provider_ref: providerRef, provider_version: verified.data.etag ?? "unknown", external_url: safeCalendarUrl(verified.data.htmlLink), verified: isVerified, before_hash: beforeHash, after_hash: hash(action), completed_at: new Date().toISOString() };
    } catch (error) { throw normalizeError(error); }
  }
}
