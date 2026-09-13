import { google } from "googleapis";
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
  const status = Number((error as { code?: unknown }).code ?? (error as { response?: { status?: unknown } }).response?.status ?? 0);
  const category = status === 401 ? "AUTH" : status === 403 ? "PERMISSION" : status === 409 || status === 412 ? "CONFLICT" : status === 429 ? "RATE_LIMIT" : status >= 500 ? "TRANSIENT" : "PERMANENT";
  return new AdapterError({ category, provider_code: status ? String(status) : undefined, retryable: category === "RATE_LIMIT" || category === "TRANSIENT", safe_message: "A Google service request could not be completed." });
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
        from: headers.from ?? "",
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
      const result = await calendar.events.list({ calendarId: this.config.GOOGLE_CALENDAR_ID, timeMin: input.start_at, timeMax: input.end_at, singleEvents: true, maxResults: 100, timeZone: input.timezone });
      const events = (result.data.items ?? [])
        .filter((event) => event.status !== "cancelled" && event.transparency !== "transparent" && !event.extendedProperties?.private?.ripple_case_id && event.start?.dateTime && event.end?.dateTime)
        .map((event) => ({
        event_ref: event.id ?? hash(event), provider_version: event.etag ?? "unknown", title: event.summary ?? "Busy commitment",
        start_at: new Date(event.start!.dateTime!).toISOString(), end_at: new Date(event.end!.dateTime!).toISOString(),
        timezone: event.start?.timeZone ?? input.timezone, attendees: (event.attendees ?? []).map((a) => a.email).filter((a): a is string => Boolean(a)),
        organizer: event.organizer?.email ?? undefined, owned_by_operator: event.organizer?.self ?? false,
        visibility: event.visibility === "private" || event.visibility === "confidential" ? "PRIVATE" as const : "DEFAULT" as const,
      }));
      const base = { captured_at: new Date().toISOString(), start_at: input.start_at, end_at: input.end_at, timezone: input.timezone, complete: !result.data.nextPageToken, events: events.sort((a, b) => a.event_ref.localeCompare(b.event_ref)) };
      return { ...base, snapshot_hash: hash({ ...base, captured_at: undefined }) };
    } catch (error) { throw normalizeError(error); }
  }

  async apply(context: WriteContext, action: CalendarAction): Promise<ProviderWriteResult> {
    validateContext(context);
    try {
      const calendar = google.calendar({ version: "v3", auth: oauth(this.config) });
      const requestBody = {
        summary: action.title, description: action.description, start: { dateTime: action.start_at, timeZone: action.timezone },
        end: { dateTime: action.end_at, timeZone: action.timezone },
        extendedProperties: { private: { ripple_case_id: context.case_id, ripple_action_id: context.action_id } },
      };
      let eventId = action.event_ref;
      let beforeHash: string | null = null;
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
      const result = eventId
        ? await calendar.events.patch({ calendarId: this.config.GOOGLE_CALENDAR_ID, eventId, requestBody })
        : await calendar.events.insert({ calendarId: this.config.GOOGLE_CALENDAR_ID, requestBody });
      const providerRef = result.data.id ?? eventId ?? action.action_id;
      const verified = await calendar.events.get({ calendarId: this.config.GOOGLE_CALENDAR_ID, eventId: providerRef });
      const metadata = verified.data.extendedProperties?.private;
      const isVerified = verified.data.id === providerRef && metadata?.ripple_action_id === context.action_id && metadata?.ripple_case_id === context.case_id;
      return { outcome: "SUCCEEDED", provider_ref: providerRef, provider_version: verified.data.etag ?? "unknown", verified: isVerified, before_hash: beforeHash, after_hash: hash(action), completed_at: new Date().toISOString() };
    } catch (error) { throw normalizeError(error); }
  }
}
