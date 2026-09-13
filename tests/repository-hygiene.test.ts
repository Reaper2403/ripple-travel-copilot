import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

function publicFiles(): string[] {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  });
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((name) => !name.startsWith("node_modules/") && !name.startsWith(".next/") && name !== ".env.local" && name !== "package-lock.json");
}

describe("public repository hygiene", () => {
  it("keeps the local environment file ignored", () => {
    expect(execFileSync("git", ["check-ignore", ".env.local"], { cwd: root, encoding: "utf8" }).trim()).toBe(".env.local");
    expect(publicFiles()).not.toContain(".env.local");
  });

  it("does not expose secret-shaped assignments or real personal identities", () => {
    // Newlines are deliberately excluded so a blank example assignment cannot
    // consume the next line. Angle-bracket placeholders are public documentation.
    // Match an address, not an OAuth scope or documentation URL whose host is
    // one of these providers (for example https://mail.google.com/).
    const personalIdentity = /[a-z0-9._%+-]+@(?:gmail\.com|yahoo\.com|outlook\.com|hotmail\.com)/i;
    const protectedKey = /(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|CLIENT_SECRET|SESSION_SECRET|ENCRYPTION_KEY)[ \t]*=/i;
    const offenders: string[] = [];
    const candidates = publicFiles().filter((name) => /\.(?:ts|tsx|js|json|md|txt|example|gitignore)$/.test(name) || name.startsWith(".env.example"));
    const findings = candidates.map((name) => {
      const content = readFileSync(path.join(root, name), "utf8");
      const unsafeLine = content.split(/\r?\n/).some((line) => {
        if (personalIdentity.test(line)) return true;
        const marker = line.match(protectedKey);
        if (!marker || marker.index === undefined) return false;
        const value = line.slice(marker.index + marker[0].length).trim();
        return value.length > 0 && !value.startsWith("<");
      });
      return unsafeLine ? name : null;
    });
    offenders.push(...findings.filter((name): name is string => Boolean(name)));
    expect(offenders, `public identity/secret leakage in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("uses only reserved example.com schema identifiers", async () => {
    for (const name of publicFiles().filter((item) => item.startsWith("contracts/") && item.endsWith(".json"))) {
      const schema = JSON.parse(await readFile(path.join(root, name), "utf8")) as { $id?: string };
      expect(schema.$id).toMatch(/^https:\/\/ripple\.example\.com\//);
    }
  });
});
