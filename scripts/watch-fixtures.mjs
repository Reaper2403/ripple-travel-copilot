import { ensureCalendarFixtures, ensureGmailFixture } from "./fixture-lib.mjs";

const intervalMs = 60_000;
console.log("WATCH    Maintaining Ripple Calendar and Gmail fixtures every 60 seconds. Press Ctrl+C to stop.");

async function maintain() {
  try {
    const calendar = await ensureCalendarFixtures({ quiet: true });
    const gmail = await ensureGmailFixture({ quiet: true });
    console.log(`${new Date().toISOString()} READY ${calendar.total} Calendar fixtures; ${calendar.created + gmail.created} repaired`);
  } catch {
    console.error(`${new Date().toISOString()} FAILED fixture maintenance; credentials or provider availability require attention`);
  }
}

await maintain();
setInterval(maintain, intervalMs);
