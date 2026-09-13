import { ensureCalendarFixtures, ensureGmailFixture } from "./fixture-lib.mjs";

const calendar = await ensureCalendarFixtures();
const gmail = await ensureGmailFixture();
console.log(`READY    ${calendar.total} executive-week events; ${calendar.created + gmail.created} created, ${calendar.updated} rescheduled`);
