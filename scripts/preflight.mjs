import nextEnv from "@next/env";
import { google } from "googleapis";
import { Client as NotionClient } from "@notionhq/client";
import OpenAI from "openai";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const checks = [];
const required = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_REFRESH_TOKEN",
  "GOOGLE_CALENDAR_ID",
  "GMAIL_INGEST_LABEL",
  "NOTION_ACCESS_TOKEN",
  "NOTION_PARENT_PAGE_ID",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "RIPPLE_OPERATOR_EMAIL",
  "DEMO_STAKEHOLDER_EMAILS",
  "SESSION_SECRET",
  "APP_ENCRYPTION_KEY",
];

function record(name, passed, detail) {
  checks.push({ name, passed, detail });
}

function rejected(service, error) {
  const status = Number(error?.status ?? error?.code ?? error?.response?.status ?? 0);
  return status ? `${service} rejected the check (status ${status})` : `${service} readiness check failed`;
}

const missing = required.filter((key) => !process.env[key]?.trim());
record("Configuration", missing.length === 0, missing.length ? `Missing ${missing.join(", ")}` : "All required values are present");

if (missing.length === 0) {
  const encryptionKey = process.env.APP_ENCRYPTION_KEY.trim();
  const encryptionBytes = /^[a-f0-9]{64}$/i.test(encryptionKey)
    ? Buffer.from(encryptionKey, "hex").length
    : /^[A-Za-z0-9+/]+={0,2}$/.test(encryptionKey)
      ? Buffer.from(encryptionKey, "base64").length
      : 0;
  const stakeholderCount = new Set(process.env.DEMO_STAKEHOLDER_EMAILS.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)).size;
  const localSecurityReady = process.env.SESSION_SECRET.trim().length >= 32 && encryptionBytes === 32 && stakeholderCount === 3;
  record("Local security", localSecurityReady, localSecurityReady ? "Secrets have safe lengths and three unique demo stakeholders are configured" : "Use a 32+ character session secret, a 32-byte encryption key, and three unique stakeholders");
}

if (missing.length === 0) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  try {
    const access = await auth.getAccessToken();
    if (!access.token) throw new Error("Google did not issue an access token");
    const info = await auth.getTokenInfo(access.token);
    const expectedScopes = [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/calendar.events",
    ];
    const absentScopes = expectedScopes.filter((scope) => !info.scopes.includes(scope));
    record("Google OAuth", absentScopes.length === 0, absentScopes.length ? "Required Google scopes are missing" : "Refresh token and required scopes are valid");
  } catch (error) {
    record("Google OAuth", false, rejected("Google OAuth", error));
  }

  try {
    const gmail = google.gmail({ version: "v1", auth });
    const labels = await gmail.users.labels.list({ userId: "me" });
    const expected = process.env.GMAIL_INGEST_LABEL.toLowerCase();
    const label = (labels.data.labels ?? []).find((item) => item.name?.toLowerCase() === expected);
    let hasDemoMessage = false;
    if (label?.id) {
      const messages = await gmail.users.messages.list({ userId: "me", labelIds: [label.id], maxResults: 1 });
      hasDemoMessage = Boolean(messages.data.messages?.length);
    }
    record(
      "Gmail",
      Boolean(label) && hasDemoMessage,
      !label ? "The configured ingest label was not found" : hasDemoMessage ? "Inbox access, ingest label, and demo message are ready" : "Add one synthetic disruption email to the configured ingest label",
    );
  } catch (error) {
    record("Gmail", false, rejected("Gmail", error));
  }

  try {
    const calendar = google.calendar({ version: "v3", auth });
    const result = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: "2026-09-14T00:00:00.000Z",
      timeMax: "2026-09-16T12:00:00.000Z",
      maxResults: 20,
      singleEvents: true,
    });
    const timedEvents = (result.data.items ?? []).filter((event) => event.start?.dateTime && event.end?.dateTime).length;
    record("Google Calendar", timedEvents >= 2, timedEvents >= 2 ? "Configured calendar and at least two timed demo commitments are ready" : "Add at least two timed commitments in the September 14–16 demo window");
  } catch (error) {
    record("Google Calendar", false, rejected("Google Calendar", error));
  }

  try {
    const notion = new NotionClient({ auth: process.env.NOTION_ACCESS_TOKEN });
    await notion.pages.retrieve({ page_id: process.env.NOTION_PARENT_PAGE_ID });
    record("Notion", true, "Integration can read the configured parent page");
  } catch (error) {
    record("Notion", false, rejected("Notion", error));
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    await openai.models.retrieve(process.env.OPENAI_MODEL);
    record("OpenAI", true, "API key can access the selected model");
  } catch (error) {
    record("OpenAI", false, rejected("OpenAI", error));
  }
}

for (const check of checks) {
  console.log(`${check.passed ? "PASS" : "FAIL"}  ${check.name}: ${check.detail}`);
}

if (checks.some((check) => !check.passed)) process.exitCode = 1;
