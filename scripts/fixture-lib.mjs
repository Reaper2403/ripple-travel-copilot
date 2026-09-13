import nextEnv from "@next/env";
import { google } from "googleapis";
import { createHash } from "node:crypto";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const required = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GOOGLE_CALENDAR_ID", "RIPPLE_OPERATOR_EMAIL", "DEMO_STAKEHOLDER_EMAILS"];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) throw new Error(`Missing required configuration: ${missing.join(", ")}`);

const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const calendar = google.calendar({ version: "v3", auth });
const gmail = google.gmail({ version: "v1", auth });
const stakeholders = [...new Set(process.env.DEMO_STAKEHOLDER_EMAILS.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))];

const timed = (dateTime, timeZone = "America/Los_Angeles") => ({ dateTime, timeZone });
const event = (seedId, summary, start, end, options = {}) => ({ seedId, summary, start: timed(start, options.timeZone), end: timed(end, options.timeZone), ...options });

export const executiveWeek = [
  event("monday-staff-briefing", "[RIPPLE DEMO] Executive staff briefing", "2026-09-14T07:00:00.000Z", "2026-09-14T07:45:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [0, 1] }),
  event("monday-board-prep", "[RIPPLE DEMO] Board preparation", "2026-09-14T08:30:00.000Z", "2026-09-14T09:30:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [1, 2] }),
  event("monday-conflict-hiring", "[RIPPLE DEMO] Leadership hiring review", "2026-09-14T09:00:00.000Z", "2026-09-14T10:00:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [0, 2] }),
  event("monday-investor-call", "[RIPPLE DEMO] Investor update", "2026-09-14T15:30:00.000Z", "2026-09-14T16:30:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [0] }),
  event("investor-dinner", "[RIPPLE DEMO] Investor dinner", "2026-09-14T17:00:00.000Z", "2026-09-14T18:00:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [0, 1] }),
  event("team-launch-review", "[RIPPLE DEMO] Team launch review", "2026-09-16T15:30:00.000Z", "2026-09-16T16:30:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [1, 2] }),
  event("monday-overlap-escalation", "[RIPPLE DEMO] Customer escalation", "2026-09-15T15:30:00.000Z", "2026-09-15T16:30:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [0, 2] }),
  event("tuesday-private-one-on-one", "[RIPPLE DEMO] Confidential leadership 1:1", "2026-09-15T07:00:00.000Z", "2026-09-15T07:45:00.000Z", { timeZone: "Europe/Berlin", visibility: "private", attendeeIndexes: [0] }),
  event("tuesday-overlap-finance", "[RIPPLE DEMO] Finance review", "2026-09-15T08:30:00.000Z", "2026-09-15T09:30:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [1] }),
  event("tuesday-product-review", "[RIPPLE DEMO] Product operating review", "2026-09-15T11:30:00.000Z", "2026-09-15T12:30:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [1, 2] }),
  event("tuesday-transparent-travel", "[RIPPLE DEMO] Optional travel research", "2026-09-16T12:00:00.000Z", "2026-09-16T13:00:00.000Z", { timeZone: "Europe/Berlin", transparency: "transparent" }),
  event("wednesday-all-day-offsite", "[RIPPLE DEMO] Board offsite", "2026-09-16T08:30:00.000Z", "2026-09-16T10:00:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [0, 1, 2] }),
  event("wednesday-conflict-launch", "[RIPPLE DEMO] Product launch checkpoint", "2026-09-16T09:30:00.000Z", "2026-09-16T10:30:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [1, 2] }),
  event("wednesday-asia-call", "[RIPPLE DEMO] APAC partner call", "2026-09-16T15:00:00+08:00", "2026-09-16T16:00:00+08:00", { timeZone: "Asia/Singapore", attendeeIndexes: [2] }),
  event("wednesday-committee", "[RIPPLE DEMO] Risk committee", "2026-09-17T13:30:00.000Z", "2026-09-17T14:30:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [0, 1] }),
  event("thursday-standup", "[RIPPLE DEMO] Executive standup", "2026-09-17T07:30:00.000Z", "2026-09-17T08:00:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [0, 1, 2] }),
  event("thursday-private-strategy", "[RIPPLE DEMO] Confidential strategy review", "2026-09-17T09:00:00.000Z", "2026-09-17T10:00:00.000Z", { timeZone: "Europe/Berlin", visibility: "private", attendeeIndexes: [1] }),
  event("thursday-press-prep", "[RIPPLE DEMO] Press preparation", "2026-09-17T12:00:00.000Z", "2026-09-17T13:00:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [0, 2] }),
  event("friday-standup", "[RIPPLE DEMO] Executive standup", "2026-09-18T07:00:00.000Z", "2026-09-18T07:30:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [0, 1, 2] }),
  event("friday-earnings-prep", "[RIPPLE DEMO] Earnings preparation", "2026-09-18T08:30:00.000Z", "2026-09-18T10:00:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [0, 1] }),
  event("friday-conflict-contract", "[RIPPLE DEMO] Partner contract review", "2026-09-18T09:30:00.000Z", "2026-09-18T10:30:00.000Z", { timeZone: "Europe/Berlin", attendeeIndexes: [0, 2] }),
  event("friday-focus-block", "[RIPPLE DEMO] Protected focus block", "2026-09-18T12:00:00.000Z", "2026-09-18T14:00:00.000Z", { timeZone: "Europe/Berlin" }),
];

export async function ensureCalendarFixtures({ quiet = false } = {}) {
  let created = 0;
  let updated = 0;
  for (const fixture of executiveWeek) {
    const existing = await calendar.events.list({ calendarId: process.env.GOOGLE_CALENDAR_ID, privateExtendedProperty: [`ripple_seed_id=${fixture.seedId}`], maxResults: 2, singleEvents: true });
    const indexes = fixture.attendeeIndexes ?? [];
    const requestBody = {
      summary: fixture.summary,
      description: "Synthetic C-level commitment for Ripple cascade testing.",
      start: fixture.start,
      end: fixture.end,
      attendees: indexes.map((index) => stakeholders[index]).filter(Boolean).map((email) => ({ email })),
      visibility: fixture.visibility,
      transparency: fixture.transparency,
      extendedProperties: { private: { ripple_seed_id: fixture.seedId, ripple_fixture: "true" } },
    };
    const prior = existing.data.items?.[0];
    if (prior?.id) {
      const instant = (value) => value?.dateTime ? new Date(value.dateTime).toISOString() : value?.date;
      const unchanged = prior.summary === fixture.summary && instant(prior.start) === instant(fixture.start) && instant(prior.end) === instant(fixture.end) && (prior.transparency ?? undefined) === (fixture.transparency ?? undefined) && (prior.visibility ?? undefined) === (fixture.visibility ?? undefined);
      if (unchanged) { if (!quiet) console.log(`EXISTS   Calendar fixture: ${fixture.seedId}`); continue; }
      await calendar.events.patch({ calendarId: process.env.GOOGLE_CALENDAR_ID, eventId: prior.id, sendUpdates: "none", requestBody });
      updated += 1;
      if (!quiet) console.log(`UPDATED  Calendar fixture: ${fixture.seedId}`);
      continue;
    }
    await calendar.events.insert({ calendarId: process.env.GOOGLE_CALENDAR_ID, sendUpdates: "none", requestBody });
    created += 1;
    if (!quiet) console.log(`CREATED  Calendar fixture: ${fixture.seedId}`);
  }
  return { created, updated, total: executiveWeek.length };
}

export async function ensureGmailFixture({ quiet = false } = {}) {
  const subject = "[RIPPLE TEST] Flight NS 442 cancelled";
  const existing = await gmail.users.messages.list({ userId: "me", q: `subject:"${subject}" newer_than:7d`, maxResults: 2 });
  if (existing.data.messages?.length) {
    if (!quiet) console.log("EXISTS   Gmail disruption fixture");
    return { created: 0 };
  }
  const sourceKey = "ripple-seed-cancellation-2026-09-14";
  const messageId = `ripple.seed.${createHash("sha256").update(sourceKey).digest("hex").slice(0, 24)}@ripple.local`;
  const mime = [
    `To: ${process.env.RIPPLE_OPERATOR_EMAIL}`,
    `Subject: ${subject}`,
    `Message-ID: <${messageId}>`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "Northstar Air flight NS 442 from Berlin (BER) to San Francisco (SFO) on 14 September 2026 has been cancelled. It was scheduled to depart at 08:00 CEST and arrive at 11:00 PDT. No replacement itinerary has been provided. This is a synthetic Ripple hackathon fixture.",
  ].join("\r\n");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw: Buffer.from(mime).toString("base64url") } });
  if (!quiet) console.log("CREATED  Gmail disruption fixture; apply the configured ingest label manually");
  return { created: 1 };
}

export async function resetCalendarFixtures() {
  const ids = new Set();
  for (const marker of ["ripple_fixture=true", "ripple_case_id=demo"]) {
    let pageToken;
    do {
      const result = await calendar.events.list({ calendarId: process.env.GOOGLE_CALENDAR_ID, privateExtendedProperty: [marker], maxResults: 2500, pageToken, singleEvents: false });
      for (const id of (result.data.items ?? []).map((item) => item.id).filter(Boolean)) ids.add(id);
      pageToken = result.data.nextPageToken ?? undefined;
    } while (pageToken);
  }
  for (const eventId of ids) {
    await calendar.events.delete({ calendarId: process.env.GOOGLE_CALENDAR_ID, eventId, sendUpdates: "none" });
  }
  return { removed: ids.size };
}
