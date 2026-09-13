import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  accountRequestSchema,
  blankConnection,
  calendarOptionsResponseSchema,
  connectionSummarySchema,
  onboardingProfileSchema,
  publicOnboardingProfile,
  V2_SCHEMA_VERSION,
  type OnboardingProfile,
  type ConnectionProvider,
  type ConnectionSummary,
} from "../src/lib/v2/contracts";
import { AdapterError } from "../src/lib/domain/errors";
import { FIXTURE_CONNECTION_VERIFIER } from "../src/lib/v2/fixtures";
import { OnboardingService } from "../src/lib/v2/onboarding-service";
import { OnboardingStore } from "../src/lib/v2/persistence";
import { configuredCalendarOption } from "../src/lib/v2/connection-verifiers";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function profile(overrides: Partial<OnboardingProfile> = {}): OnboardingProfile {
  const timestamp = "2026-09-13T18:00:00.000Z";
  return {
    schema_version: V2_SCHEMA_VERSION,
    session_id: "20c8f906-7e8d-4d3f-b4d8-eb872aa4ed8f",
    version: 1,
    current_step: "account",
    completed: false,
    connections: {
      gmail: blankConnection("gmail", "fixture"),
      calendar: blankConnection("calendar", "fixture"),
      notion: blankConnection("notion", "fixture"),
    },
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

function verifiedConnection(provider: ConnectionProvider, validUntil = "2026-09-13T19:00:00.000Z"): ConnectionSummary {
  return {
    schema_version: V2_SCHEMA_VERSION,
    provider,
    status: "verified",
    verification_mode: "fixture",
    display_name: `Demo ${provider}`,
    capabilities: [{ key: `${provider}.required`, label: "Required capability", verified: true }],
    checked_at: "2026-09-13T18:00:00.000Z",
    valid_until: validUntil,
  };
}

describe("v2 public contract baseline", () => {
  it("builds the narrow-scope calendar fallback only from provider-returned metadata", () => {
    expect(configuredCalendarOption("primary", { summary: "Executive calendar", accessRole: "owner" })).toEqual({
      selection_token: expect.stringMatching(/^[a-f0-9]{32}$/),
      provider_calendar_id: "primary",
      display_name: "Executive calendar",
      primary: true,
      writable: true,
    });
    expect(configuredCalendarOption("read-only", { summary: "Company events", accessRole: "reader" }).writable).toBe(false);
    expect(() => configuredCalendarOption("primary", { accessRole: "owner" })).toThrow("enough calendar details");
  });
  it("accepts the canonical blank onboarding profile and rejects incompatible versions", () => {
    const candidate = profile();
    expect(onboardingProfileSchema.parse(candidate)).toEqual(candidate);
    expect(onboardingProfileSchema.safeParse({ ...candidate, schema_version: "1.0" }).success).toBe(false);
  });

  it("rejects provider calendar identifiers at the public contract boundary", () => {
    const candidate = {
      schema_version: V2_SCHEMA_VERSION,
      options: [{
        selection_token: "opaque-calendar-selection",
        provider_calendar_id: "private-provider-identifier",
        display_name: "Executive calendar",
        primary: true,
        writable: true,
      }],
    };
    expect(calendarOptionsResponseSchema.safeParse(candidate).success).toBe(false);
  });

  it("normalizes account display names and rejects blank or oversized input", () => {
    expect(accountRequestSchema.parse({ display_name: "  Alex Morgan  " })).toEqual({ display_name: "Alex Morgan" });
    expect(accountRequestSchema.safeParse({ display_name: "   " }).success).toBe(false);
    expect(accountRequestSchema.safeParse({ display_name: "x".repeat(81) }).success).toBe(false);
  });

  it("uses synthetic identities and truthful fixture mode in the shared verifier", async () => {
    const gmail = await FIXTURE_CONNECTION_VERIFIER.verifyGmail();
    expect(FIXTURE_CONNECTION_VERIFIER.mode).toBe("fixture");
    expect(gmail.identity).toMatch(/@example\.com$/);
    expect(gmail.capabilities.length).toBeGreaterThan(0);
    expect(gmail.capabilities.every((capability) => capability.verified)).toBe(true);
    expect(connectionSummarySchema.parse(blankConnection("gmail", "fixture"))).toMatchObject({
      provider: "gmail",
      status: "not_started",
      verification_mode: "fixture",
    });
  });

  it("rejects unknown public fields and incomplete verified states", () => {
    expect(connectionSummarySchema.safeParse({
      ...blankConnection("gmail", "fixture"),
      access_token: "must-not-cross-the-boundary",
    }).success).toBe(false);
    expect(connectionSummarySchema.safeParse({
      ...blankConnection("gmail", "fixture"),
      status: "needs_attention",
    }).success).toBe(false);
    expect(connectionSummarySchema.safeParse({
      ...blankConnection("gmail", "fixture"),
      status: "verified",
      capabilities: [{ key: "mail.read", label: "Read messages", verified: true }],
    }).success).toBe(false);
  });

  it("rejects mismatched provider slots and dishonest completion", () => {
    const mismatch = profile();
    mismatch.connections.gmail = blankConnection("calendar", "fixture");
    expect(onboardingProfileSchema.safeParse(mismatch).success).toBe(false);
    expect(onboardingProfileSchema.safeParse({ ...profile(), completed: true, current_step: "workspace" }).success).toBe(false);
  });

  it("never exposes the HttpOnly session identifier in the public onboarding view", () => {
    const internal = profile();
    expect(publicOnboardingProfile(internal)).not.toHaveProperty("session_id");
    expect(JSON.stringify(publicOnboardingProfile(internal))).not.toContain(internal.session_id);
  });
});

describe("v2 onboarding persistence", () => {
  async function store(): Promise<OnboardingStore> {
    const directory = await mkdtemp(path.join(tmpdir(), "ripple-v2-onboarding-"));
    temporaryDirectories.push(directory);
    return new OnboardingStore(path.join(directory, "state.json"));
  }

  it("round-trips isolated sessions without sharing mutable references", async () => {
    const repository = await store();
    const first = profile();
    const second = profile({ session_id: "275f1f88-5e73-44e6-88c3-df371ae61a3e" });
    await repository.save(first);
    await repository.save(second);

    const loaded = await repository.get(first.session_id);
    loaded!.current_step = "gmail";

    expect((await repository.get(first.session_id))?.current_step).toBe("account");
    expect((await repository.get(second.session_id))?.session_id).toBe(second.session_id);
  });

  it("rejects stale optimistic writes and preserves the stored version", async () => {
    const repository = await store();
    const initial = profile();
    await repository.save(initial);
    const next = profile({ version: 2, current_step: "gmail", updated_at: "2026-09-13T18:01:00.000Z" });

    await expect(repository.save(next, 0)).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    expect(await repository.get(initial.session_id)).toEqual(initial);
  });
});

describe("v2 onboarding service integration", () => {
  async function service(verifier = FIXTURE_CONNECTION_VERIFIER): Promise<OnboardingService> {
    const directory = await mkdtemp(path.join(tmpdir(), "ripple-v2-service-"));
    temporaryDirectories.push(directory);
    return new OnboardingService(new OnboardingStore(path.join(directory, "state.json")), verifier);
  }

  it("completes the fixture flow using only server-derived verified summaries", async () => {
    const onboarding = await service();
    const { profile: created } = await onboarding.getOrCreate();
    const account = await onboarding.saveAccount(created.session_id, "Alex Morgan");
    const gmail = await onboarding.verify(account.session_id, "gmail");
    const options = await onboarding.calendarOptions(gmail.session_id);
    const calendar = await onboarding.selectCalendar(gmail.session_id, options[0].selection_token);
    const notion = await onboarding.verify(calendar.session_id, "notion");
    const completed = await onboarding.complete(notion.session_id);

    expect(options[0]).not.toHaveProperty("provider_calendar_id");
    expect(Object.values(completed.connections).every((connection) =>
      connection.status === "verified" && Boolean(connection.checked_at) && Boolean(connection.valid_until),
    )).toBe(true);
    expect(Object.values(completed.connections).every((connection) =>
      Date.parse(connection.valid_until!) - Date.parse(connection.checked_at!) >= 24 * 60 * 60 * 1000,
    )).toBe(true);
    expect(completed).toMatchObject({ completed: true, current_step: "workspace" });
    expect(onboardingProfileSchema.safeParse(completed).success).toBe(true);
  });

  it("maps provider failures to one safe needs-attention state", async () => {
    const onboarding = await service({
      ...FIXTURE_CONNECTION_VERIFIER,
      async verifyGmail() {
        throw new AdapterError({
          category: "AUTH",
          retryable: false,
          safe_message: "Reconnect Gmail to continue.",
          redacted_details: { credential: "must-not-leak" },
        });
      },
    });
    const { profile } = await onboarding.getOrCreate();
    await onboarding.saveAccount(profile.session_id, "Alex Morgan");
    const failed = await onboarding.verify(profile.session_id, "gmail");

    expect(failed.connections.gmail).toMatchObject({
      status: "needs_attention",
      safe_error: "Reconnect Gmail to continue.",
      capabilities: [],
    });
    expect(JSON.stringify(failed)).not.toContain("must-not-leak");
  });

  it("does not allow completion before every provider is verified", async () => {
    const onboarding = await service();
    const { profile } = await onboarding.getOrCreate();
    await onboarding.saveAccount(profile.session_id, "Alex Morgan");
    await expect(onboarding.complete(profile.session_id)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("enforces the server-owned onboarding order before provider access", async () => {
    const onboarding = await service();
    const { profile } = await onboarding.getOrCreate();
    await expect(onboarding.verify(profile.session_id, "gmail")).rejects.toMatchObject({ code: "INVALID_STATE" });
    await onboarding.saveAccount(profile.session_id, "Alex Morgan");
    await expect(onboarding.calendarOptions(profile.session_id)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(onboarding.verify(profile.session_id, "notion")).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("does not expose provider calendar metadata to an unknown session", async () => {
    const onboarding = await service();
    await expect(onboarding.calendarOptions("9c818687-abf6-4425-bfb7-758cbc0917d0")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows only one winner when the same session is updated concurrently", async () => {
    const onboarding = await service();
    const { profile } = await onboarding.getOrCreate();
    const results = await Promise.allSettled([
      onboarding.saveAccount(profile.session_id, "Alex Morgan"),
      onboarding.saveAccount(profile.session_id, "Taylor Reed"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("expires stale verified summaries instead of returning a connected workspace", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ripple-v2-expiry-"));
    temporaryDirectories.push(directory);
    const repository = new OnboardingStore(path.join(directory, "state.json"));
    const expired = profile({
      current_step: "workspace",
      completed: true,
      account: { display_name: "Alex Morgan" },
      connections: {
        gmail: { ...verifiedConnection("gmail", "2020-01-01T01:00:00.000Z"), checked_at: "2020-01-01T00:00:00.000Z" },
        calendar: { ...verifiedConnection("calendar", "2020-01-01T01:00:00.000Z"), checked_at: "2020-01-01T00:00:00.000Z" },
        notion: { ...verifiedConnection("notion", "2020-01-01T01:00:00.000Z"), checked_at: "2020-01-01T00:00:00.000Z" },
      },
    });
    await repository.save(expired);
    const onboarding = new OnboardingService(repository, FIXTURE_CONNECTION_VERIFIER);
    const result = await onboarding.getOrCreate(expired.session_id);

    expect(result.created).toBe(false);
    expect(result.profile).toMatchObject({ completed: false, current_step: "gmail" });
    expect(Object.values(result.profile.connections).every((connection) =>
      connection.status === "needs_attention" && Boolean(connection.safe_error),
    )).toBe(true);
    expect(onboardingProfileSchema.safeParse(result.profile).success).toBe(true);
  });

  it("restores workspaces affected by the former five-minute demo timeout", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ripple-v2-legacy-expiry-"));
    temporaryDirectories.push(directory);
    const repository = new OnboardingStore(path.join(directory, "state.json"));
    const legacy = profile({
      version: 2,
      current_step: "gmail",
      completed: false,
      account: { display_name: "Alex Morgan" },
      connections: {
        gmail: { ...verifiedConnection("gmail", "2020-01-01T00:05:00.000Z"), status: "needs_attention", safe_error: "This connection check expired. Verify it again to continue." },
        calendar: verifiedConnection("calendar", "2020-01-01T00:05:00.000Z"),
        notion: verifiedConnection("notion", "2020-01-01T00:05:00.000Z"),
      },
    });
    await repository.save(legacy);
    const onboarding = new OnboardingService(repository, FIXTURE_CONNECTION_VERIFIER);
    const result = await onboarding.getOrCreate(legacy.session_id);

    expect(result.profile).toMatchObject({ completed: true, current_step: "workspace" });
    expect(Object.values(result.profile.connections).every((connection) => connection.status === "verified" && Date.parse(connection.valid_until!) > Date.now())).toBe(true);
  });
});
