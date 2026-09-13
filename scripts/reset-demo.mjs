import { resetCalendarFixtures } from "./fixture-lib.mjs";

const result = await resetCalendarFixtures();
console.log(`RESET    Removed ${result.removed} Ripple-owned Calendar fixtures; all pre-existing events were preserved`);
