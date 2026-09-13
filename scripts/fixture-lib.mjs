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
  event("monday-staff-briefing", "[RIPPLE DEMO] Executive staff briefing", "2026-09-14T15:00:00.000Z", "2026-09-14T15:45:00.000Z", { attendeeIndexes: [0, 1] }),
  event("monday-board-prep", "[RIPPLE DEMO] Board preparation", "2026-09-14T16:00:00.000Z", "2026-09-14T17:00:00.000Z", { attendeeIndexes: [1, 2] }),
  event("monday-investor-call", "[RIPPLE DEMO] Investor update", "2026-09-14T17:30:00.000Z", "2026-09-14T18:30:00.000Z", { attendeeIndexes: [0] }),
  event("investor-dinner", "[RIPPLE DEMO] Investor dinner", "2026-09-14T19:00:00.000Z", "2026-09-14T20:00:00.000Z", { attendeeIndexes: [0, 1] }),
  event("team-launch-review", "[RIPPLE DEMO] Team launch review", "2026-09-14T21:00:00.000Z", "2026-09-14T22:00:00.000Z", { attendeeIndexes: [1, 2] }),
  event("monday-overlap-escalation", "[RIPPLE DEMO] Customer escalation", "2026-09-14T21:30:00.000Z", "2026-09-14T22:30:00.000Z", { attendeeIndexes: [0, 2] }),
  event("tuesday-private-one-on-one", "[RIPPLE DEMO] Confidential leadership 1:1", "2026-09-15T15:00:00.000Z", "2026-09-15T15:45:00.000Z", { visibility: "private", attendeeIndexes: [0] }),
  event("tuesday-overlap-finance", "[RIPPLE DEMO] Finance review", "2026-09-15T15:30:00.000Z", "2026-09-15T16:30:00.000Z", { attendeeIndexes: [1] }),
  event("tuesday-product-review", "[RIPPLE DEMO] Product operating review", "2026-09-15T16:30:00.000Z", "2026-09-15T17:30:00.000Z", { attendeeIndexes: [1, 2] }),
  event("tuesday-transparent-travel", "[RIPPLE DEMO] Optional travel research", "2026-09-15T19:00:00.000Z", "2026-09-15T20:00:00.000Z", { transparency: "transparent" }),
  { seedId: "wednesday-all-day-offsite", summary: "[RIPPLE DEMO] Board offsite", start: { date: "2026-09-16" }, end: { date: "2026-09-17" }, attendeeIndexes: [0, 1, 2] },
  event("wednesday-asia-call", "[RIPPLE DEMO] APAC partner call", "2026-09-16T15:00:00+08:00", "2026-09-16T16:00:00+08:00", { timeZone: "Asia/Singapore", attendeeIndexes: [2] }),
  event("wednesday-committee", "[RIPPLE DEMO] Risk committee", "2026-09-16T17:00:00.000Z", "2026-09-16T18:00:00.000Z", { attendeeIndexes: [0, 1] }),
  event("thursday-standup", "[RIPPLE DEMO] Executive standup", "2026-09-17T15:00:00.000Z", "2026-09-17T15:30:00.000Z", { attendeeIndexes: [0, 1, 2] }),
  event("thursday-private-strategy", "[RIPPLE DEMO] Confidential strategy review", "2026-09-17T16:00:00.000Z", "2026-09-17T17:00:00.000Z", { visibility: "private", attendeeIndexes: [1] }),
  event("thursday-press-prep", "[RIPPLE DEMO] Press preparation", "2026-09-17T18:00:00.000Z", "2026-09-17T19:00:00.000Z", { attendeeIndexes: [0, 2] }),
  event("friday-standup", "[RIPPLE DEMO] Executive standup", "2026-09-18T15:00:00.000Z", "2026-09-18T15:30:00.000Z", { attendeeIndexes: [0, 1, 2] }),
  event("friday-earnings-prep", "[RIPPLE DEMO] Earnings preparation", "2026-09-18T16:00:00.000Z", "2026-09-18T17:30:00.000Z", { attendeeIndexes: [0, 1] }),
  event("friday-focus-block", "[RIPPLE DEMO] Protected focus block", "2026-09-18T19:00:00.000Z", "2026-09-18T21:00:00.000Z"),
];

export async function ensureCalendarFixtures({ quiet = false } = {}) {
  let created = 0;
  for (const fixture of executiveWeek) {
    const existing = await calendar.events.list({ calendarId: process.env.GOOGLE_CALENDAR_ID, privateExtendedProperty: [`ripple_seed_id=${fixture.seedId}`], maxResults: 2, singleEvents: true });
    if (existing.data.items?.length) {
      if (!quiet) console.log(`EXISTS   Calendar fixture: ${fixture.seedId}`);
      continue;
    }
    const indexes = fixture.attendeeIndexes ?? [];
    await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      sendUpdates: "none",
      requestBody: {
        summary: fixture.summary,
        description: "Synthetic C-level commitment for Ripple cascade testing.",
        start: fixture.start,
        end: fixture.end,
        attendees: indexes.map((index) => stakeholders[index]).filter(Boolean).map((email) => ({ email })),
        visibility: fixture.visibility,
        transparency: fixture.transparency,
        extendedProperties: { private: { ripple_seed_id: fixture.seedId, ripple_fixture: "true" } },
      },
    });
    created += 1;
    if (!quiet) console.log(`CREATED  Calendar fixture: ${fixture.seedId}`);
  }
  return { created, total: executiveWeek.length };
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
