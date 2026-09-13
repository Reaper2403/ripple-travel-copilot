import { Client } from "@notionhq/client";
import { google } from "googleapis";
import type { ServerConfig } from "../config";
import { AdapterError } from "../domain/errors";
import { hash } from "../domain/hash";
import type { ConnectionVerifierPort, InternalCalendarOption, VerifiedConnection } from "./contracts";
import { FIXTURE_CONNECTION_VERIFIER } from "./fixtures";

const GMAIL_READ_SCOPES = new Set([
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://mail.google.com/",
]);
const GMAIL_SEND_SCOPES = new Set([
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://mail.google.com/",
]);

function googleError(error: unknown): AdapterError {
  const status = Number((error as { code?: unknown }).code ?? (error as { response?: { status?: unknown } }).response?.status ?? 0);
  const category = status === 401 ? "AUTH" : status === 403 ? "PERMISSION" : status === 429 ? "RATE_LIMIT" : status >= 500 ? "TRANSIENT" : "PERMANENT";
  return new AdapterError({ category, provider_code: status ? String(status) : undefined, retryable: category === "RATE_LIMIT" || category === "TRANSIENT", safe_message: "Google could not verify this connection." });
}

function requireValues(config: ServerConfig, keys: Array<keyof ServerConfig>): void {
  if (keys.some((key) => !config[key])) {
    throw new AdapterError({ category: "AUTH", retryable: false, safe_message: "This connection is not configured yet." });
  }
}

function oauth(config: ServerConfig) {
  requireValues(config, ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]);
  const client = new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, config.GOOGLE_REDIRECT_URI);
  client.setCredentials({ refresh_token: config.GOOGLE_REFRESH_TOKEN });
  return client;
}

function titleFromNotionPage(page: unknown): string {
  const properties = (page as { properties?: Record<string, { type?: string; title?: Array<{ plain_text?: string }> }> }).properties ?? {};
  const title = Object.values(properties).find((property) => property.type === "title")?.title?.map((part) => part.plain_text ?? "").join("").trim();
  return title || "Ripple follow-through";
}

export class RealConnectionVerifier implements ConnectionVerifierPort {
  readonly mode = "real" as const;
  constructor(private readonly config: ServerConfig) {}

  async verifyGmail(): Promise<VerifiedConnection> {
    try {
      const auth = oauth(this.config);
      const gmail = google.gmail({ version: "v1", auth });
      const [profile, labels, token] = await Promise.all([
        gmail.users.getProfile({ userId: "me" }),
        gmail.users.labels.list({ userId: "me" }),
        auth.getAccessToken().then(async (access) => access.token ? auth.getTokenInfo(access.token) : undefined),
      ]);
      const scopes = new Set(token?.scopes ?? []);
      const canRead = [...GMAIL_READ_SCOPES].some((scope) => scopes.has(scope));
      const canSend = [...GMAIL_SEND_SCOPES].some((scope) => scopes.has(scope));
      const labelVisible = (labels.data.labels ?? []).some((label) => label.name === this.config.GMAIL_INGEST_LABEL);
      if (!profile.data.emailAddress || !canRead || !canSend) {
        throw new AdapterError({ category: "PERMISSION", retryable: false, safe_message: "Gmail needs both message-reading and approved-send access." });
      }
      if (profile.data.emailAddress.toLowerCase() !== this.config.RIPPLE_OPERATOR_EMAIL.toLowerCase()) {
        throw new AdapterError({ category: "AUTH", retryable: false, safe_message: "Gmail is connected to a different operator account." });
      }
      return {
        display_name: "Gmail",
        identity: profile.data.emailAddress,
        capabilities: [
          { key: "mail.read", label: labelVisible ? "Read the Ripple label" : "Read labeled messages", verified: canRead },
          { key: "mail.send", label: "Send approved messages", verified: canSend },
        ],
      };
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw googleError(error);
    }
  }

  async listCalendars(): Promise<InternalCalendarOption[]> {
    const calendar = google.calendar({ version: "v3", auth: oauth(this.config) });
    try {
      const result = await calendar.calendarList.list({ maxResults: 100, showHidden: false });
      return (result.data.items ?? []).filter((item) => item.id && item.summary).map((item) => ({
        selection_token: hash(`calendar:${item.id}`).slice(0, 32),
        provider_calendar_id: item.id!,
        display_name: item.summary!,
        primary: item.primary === true,
        writable: item.accessRole === "owner" || item.accessRole === "writer",
      }));
    } catch {
      // calendar.events grants permit event reads/writes but may not permit
      // CalendarList discovery. The Events collection still returns the
      // configured calendar's provider-owned summary and accessRole.
      try {
        const start = new Date();
        const result = await calendar.events.list({
          calendarId: this.config.GOOGLE_CALENDAR_ID,
          timeMin: start.toISOString(),
          timeMax: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          maxResults: 1,
          singleEvents: true,
        });
        return [configuredCalendarOption(this.config.GOOGLE_CALENDAR_ID, result.data)];
      } catch (error) { throw googleError(error); }
    }
  }

  async verifyCalendar(providerCalendarId: string): Promise<VerifiedConnection> {
    try {
      const calendar = google.calendar({ version: "v3", auth: oauth(this.config) });
      const start = new Date();
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const events = await calendar.events.list({ calendarId: providerCalendarId, timeMin: start.toISOString(), timeMax: end.toISOString(), maxResults: 1, singleEvents: true });
      let metadata: { summary?: string | null; accessRole?: string | null } = events.data;
      try {
        const entry = await calendar.calendarList.get({ calendarId: providerCalendarId });
        metadata = { summary: entry.data.summaryOverride || entry.data.summary, accessRole: entry.data.accessRole };
      } catch {
        // Retain the provider-returned Events collection metadata when the
        // narrow grant cannot read CalendarList.
      }
      const writable = metadata.accessRole === "owner" || metadata.accessRole === "writer";
      if (!writable) throw new AdapterError({ category: "PERMISSION", retryable: false, safe_message: "Choose a calendar where Ripple can create approved holds." });
      const name = metadata.summary?.trim();
      if (!name) throw new AdapterError({ category: "PERMISSION", retryable: false, safe_message: "Google did not return a verifiable calendar name." });
      return {
        display_name: name,
        destination_label: name,
        capabilities: [
          { key: "calendar.read", label: "Read schedule", verified: true },
          { key: "calendar.write", label: "Create approved holds", verified: true },
        ],
      };
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw googleError(error);
    }
  }

  async verifyNotion(): Promise<VerifiedConnection> {
    requireValues(this.config, ["NOTION_ACCESS_TOKEN", "NOTION_PARENT_PAGE_ID"]);
    try {
      const client = new Client({ auth: this.config.NOTION_ACCESS_TOKEN });
      const [bot, page] = await Promise.all([
        client.users.me({}),
        client.pages.retrieve({ page_id: this.config.NOTION_PARENT_PAGE_ID! }),
      ]);
      // Notion exposes no read-only capability introspection for child creation.
      // Prove the exact permission with a minimal page and immediately archive it.
      const probe = await client.pages.create({
        parent: { type: "page_id", page_id: this.config.NOTION_PARENT_PAGE_ID! },
        properties: { title: { type: "title", title: [{ type: "text", text: { content: "Ripple connection check" } }] } },
      });
      const archived = await client.pages.update({ page_id: probe.id, archived: true });
      if (!("archived" in archived) || archived.archived !== true) {
        throw new AdapterError({ category: "UNKNOWN_OUTCOME", retryable: false, safe_message: "Notion created a connection check page but could not confirm cleanup." });
      }
      return {
        display_name: bot.name || "Notion workspace",
        destination_label: titleFromNotionPage(page),
        capabilities: [
          { key: "notion.page.read", label: "Access follow-through destination", verified: true },
          { key: "notion.child.create", label: "Create follow-through pages", verified: true },
        ],
      };
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      const status = Number((error as { status?: unknown }).status ?? 0);
      const category = status === 401 ? "AUTH" : status === 403 || status === 404 ? "PERMISSION" : status === 429 ? "RATE_LIMIT" : status >= 500 ? "TRANSIENT" : "PERMANENT";
      throw new AdapterError({ category, retryable: category === "RATE_LIMIT" || category === "TRANSIENT", safe_message: "Notion could not verify the follow-through destination." });
    }
  }
}

export function configuredCalendarOption(
  calendarId: string,
  metadata: { summary?: string | null; accessRole?: string | null },
): InternalCalendarOption {
  const displayName = metadata.summary?.trim();
  if (!displayName || !metadata.accessRole) {
    throw new AdapterError({ category: "PERMISSION", retryable: false, safe_message: "Google did not return enough calendar details to verify this destination." });
  }
  return {
    selection_token: hash(`calendar:${calendarId}`).slice(0, 32),
    provider_calendar_id: calendarId,
    display_name: displayName,
    primary: calendarId === "primary",
    writable: metadata.accessRole === "owner" || metadata.accessRole === "writer",
  };
}

export function createConnectionVerifier(config: ServerConfig): ConnectionVerifierPort {
  return config.PROVIDER_MODE === "real" ? new RealConnectionVerifier(config) : FIXTURE_CONNECTION_VERIFIER;
}
