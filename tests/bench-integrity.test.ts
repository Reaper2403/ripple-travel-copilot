import { describe, expect, it } from "vitest";
import { runBench } from "../src/lib/bench";

describe("reliability bench integrity", () => {
  it("runs at least eight named scenarios with assertion-level evidence", async () => {
    const result = await runBench();
    expect(result.total).toBeGreaterThanOrEqual(8);
    expect(result.scenarios).toHaveLength(result.total);
    expect(result.scenarios.every((scenario) => scenario.assertions.length > 0)).toBe(true);
    expect(result.passed).toBe(result.scenarios.filter((scenario) => scenario.passed).length);
    expect(result.score_percent).toBe(Math.round((result.passed / result.total) * 100));
  });

  it("does not pass while any scenario assertion fails", async () => {
    const result = await runBench();
    const failing = result.scenarios.flatMap((scenario) => scenario.assertions).filter((assertion) => !assertion.passed);
    expect(failing, `failed assertions: ${failing.map((item) => item.description).join(", ")}`).toEqual([]);
    expect(result.passed).toBe(result.total);
  });

  it("covers the required failure and abuse classes", async () => {
    const result = await runBench();
    const searchable = result.scenarios.map((scenario) => `${scenario.id} ${scenario.name}`).join(" ").toLowerCase();
    for (const required of ["golden", "ambiguous", "duplicate", "stale", "concurrent", "notion", "calendar", "gmail", "injection"]) {
      expect(searchable, `missing bench coverage for ${required}`).toContain(required);
    }
  });
});
