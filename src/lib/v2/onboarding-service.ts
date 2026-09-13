import { randomUUID } from "node:crypto";
import { getServerConfig } from "../config";
import { AdapterError, DomainError } from "../domain/errors";
import type { CalendarOption, ConnectionProvider, ConnectionSummary, ConnectionVerifierPort, OnboardingProfile, OnboardingStep, VerifiedConnection } from "./contracts";
import { blankConnection, V2_SCHEMA_VERSION } from "./contracts";
import { createConnectionVerifier } from "./connection-verifiers";
import { OnboardingStore } from "./persistence";

// This is a connection-health freshness window, not an OAuth access-token lifetime.
// Keep it comfortably longer than a demo or working day so a healthy workspace
// never drops back into onboarding while the executive is using it.
const VALIDITY_MS = 24 * 60 * 60 * 1000;
const LEGACY_EXPIRY_ERROR = "This connection check expired. Verify it again to continue.";
export const V2_SESSION_COOKIE = "ripple_v2_session";

function now(): string { return new Date().toISOString(); }

function maskIdentity(value: string): string {
  const [local, domain] = value.split("@");
  if (!domain) return value.length <= 3 ? "***" : `${value.slice(0, 2)}***`;
  return `${local.slice(0, Math.min(2, local.length))}${local.length > 2 ? "***" : ""}@${domain}`;
}

function nextStep(provider: ConnectionProvider): OnboardingStep {
  return provider === "gmail" ? "calendar" : provider === "calendar" ? "notion" : "complete";
}

function summary(provider: ConnectionProvider, mode: "real" | "fixture", result: VerifiedConnection): ConnectionSummary {
  const checked_at = now();
  return {
    schema_version: V2_SCHEMA_VERSION,
    provider,
    status: "verified",
    verification_mode: mode,
    display_name: result.display_name,
    masked_identity: result.identity ? maskIdentity(result.identity) : undefined,
    destination_label: result.destination_label,
    capabilities: result.capabilities,
    checked_at,
    valid_until: new Date(Date.parse(checked_at) + VALIDITY_MS).toISOString(),
  };
}

function failure(provider: ConnectionProvider, mode: "real" | "fixture", error: unknown): ConnectionSummary {
  const safe_error = error instanceof AdapterError ? error.detail.safe_message : "Ripple could not verify this connection.";
  return { schema_version: V2_SCHEMA_VERSION, provider, status: "needs_attention", verification_mode: mode, capabilities: [], checked_at: now(), safe_error };
}

export class OnboardingService {
  constructor(
    private readonly store: OnboardingStore,
    private readonly verifier: ConnectionVerifierPort,
  ) {}

  async getOrCreate(sessionId?: string): Promise<{ profile: OnboardingProfile; created: boolean }> {
    if (sessionId) {
      const existing = await this.store.get(sessionId);
      if (existing) {
        const connections = structuredClone(existing.connections);
        let migratedLegacyWindow = false;
        for (const provider of Object.keys(connections) as ConnectionProvider[]) {
          const connection = connections[provider];
          if (!connection.checked_at || !connection.valid_until) continue;
          const legacyWindow = Date.parse(connection.valid_until) - Date.parse(connection.checked_at);
          if (legacyWindow > 5 * 60 * 1000) continue;
          if (connection.status === "needs_attention" && connection.safe_error !== LEGACY_EXPIRY_ERROR) continue;
          connections[provider] = {
            ...connection,
            status: "verified",
            safe_error: undefined,
            valid_until: new Date(Date.now() + VALIDITY_MS).toISOString(),
          };
          migratedLegacyWindow = true;
        }
        if (migratedLegacyWindow) {
          const restoredWorkspace = Boolean(existing.account) && Object.values(connections).every((connection) => connection.status === "verified");
          const migrated = await this.store.save({
            ...existing,
            connections,
            completed: restoredWorkspace,
            current_step: restoredWorkspace ? "workspace" : existing.current_step,
            version: existing.version + 1,
            updated_at: now(),
          }, existing.version);
          return { profile: migrated, created: false };
        }
        const expired = (Object.keys(existing.connections) as ConnectionProvider[]).filter((provider) => {
          const connection = existing.connections[provider];
          return connection.status === "verified" && (!connection.valid_until || Date.parse(connection.valid_until) <= Date.now());
        });
        if (!expired.length) return { profile: existing, created: false };
        for (const provider of expired) connections[provider] = { ...connections[provider], status: "needs_attention", safe_error: LEGACY_EXPIRY_ERROR };
        const first = (["gmail", "calendar", "notion"] as const).find((provider) => connections[provider].status !== "verified") ?? "gmail";
        const refreshed = await this.store.save({ ...existing, connections, completed: false, current_step: first, version: existing.version + 1, updated_at: now() }, existing.version);
        return { profile: refreshed, created: false };
      }
    }
    const created_at = now();
    const profile: OnboardingProfile = {
      schema_version: V2_SCHEMA_VERSION,
      session_id: randomUUID(),
      version: 1,
      current_step: "account",
      completed: false,
      connections: {
        gmail: blankConnection("gmail", this.verifier.mode),
        calendar: blankConnection("calendar", this.verifier.mode),
        notion: blankConnection("notion", this.verifier.mode),
      },
      created_at,
      updated_at: created_at,
    };
    await this.store.save(profile);
    return { profile, created: true };
  }

  async saveAccount(sessionId: string, displayName: string): Promise<OnboardingProfile> {
    const profile = await this.required(sessionId);
    return this.store.save({ ...profile, account: { display_name: displayName }, current_step: "gmail", version: profile.version + 1, updated_at: now() }, profile.version);
  }

  async verify(sessionId: string, provider: Exclude<ConnectionProvider, "calendar">): Promise<OnboardingProfile> {
    const profile = await this.required(sessionId);
    if (provider === "gmail" && !profile.account) throw new DomainError("Finish your profile before connecting Gmail.", "INVALID_STATE");
    if (provider === "notion" && profile.connections.calendar.status !== "verified") throw new DomainError("Connect a calendar before connecting Notion.", "INVALID_STATE");
    const verifying = await this.store.save({ ...profile, connections: { ...profile.connections, [provider]: { ...profile.connections[provider], status: "verifying", safe_error: undefined } }, version: profile.version + 1, updated_at: now() }, profile.version);
    try {
      const result = provider === "gmail" ? await this.verifier.verifyGmail() : await this.verifier.verifyNotion();
      return this.store.save({ ...verifying, connections: { ...verifying.connections, [provider]: summary(provider, this.verifier.mode, result) }, current_step: nextStep(provider), version: verifying.version + 1, updated_at: now() }, verifying.version);
    } catch (error) {
      return this.store.save({ ...verifying, connections: { ...verifying.connections, [provider]: failure(provider, this.verifier.mode, error) }, version: verifying.version + 1, updated_at: now() }, verifying.version);
    }
  }

  async calendarOptions(sessionId: string): Promise<CalendarOption[]> {
    const profile = await this.required(sessionId);
    if (profile.connections.gmail.status !== "verified") throw new DomainError("Connect Gmail before choosing a calendar.", "INVALID_STATE");
    return (await this.verifier.listCalendars()).map(({ provider_calendar_id: _, ...option }) => option);
  }

  async selectCalendar(sessionId: string, selectionToken: string): Promise<OnboardingProfile> {
    const profile = await this.required(sessionId);
    if (profile.connections.gmail.status !== "verified") throw new DomainError("Connect Gmail before choosing a calendar.", "INVALID_STATE");
    const options = await this.verifier.listCalendars();
    const selected = options.find((option) => option.selection_token === selectionToken);
    if (!selected) throw new DomainError("Select one of the available calendars.", "INVALID_REQUEST");
    if (!selected.writable) throw new DomainError("Choose a calendar where Ripple can create approved holds.", "INVALID_REQUEST");
    const verifying = await this.store.save({ ...profile, selected_calendar_token: selectionToken, connections: { ...profile.connections, calendar: { ...profile.connections.calendar, status: "verifying", safe_error: undefined } }, version: profile.version + 1, updated_at: now() }, profile.version);
    try {
      const result = await this.verifier.verifyCalendar(selected.provider_calendar_id);
      return this.store.saveVerifiedCalendar({ ...verifying, connections: { ...verifying.connections, calendar: summary("calendar", this.verifier.mode, result) }, current_step: "notion", version: verifying.version + 1, updated_at: now() }, verifying.version, selected.provider_calendar_id);
    } catch (error) {
      return this.store.save({ ...verifying, connections: { ...verifying.connections, calendar: failure("calendar", this.verifier.mode, error) }, version: verifying.version + 1, updated_at: now() }, verifying.version);
    }
  }

  async complete(sessionId: string): Promise<OnboardingProfile> {
    const profile = await this.required(sessionId);
    if (!profile.account || Object.values(profile.connections).some((connection) => connection.status !== "verified")) {
      throw new DomainError("Finish each connection before entering your workspace.", "INVALID_STATE");
    }
    return this.store.save({ ...profile, completed: true, current_step: "workspace", version: profile.version + 1, updated_at: now() }, profile.version);
  }

  private async required(sessionId: string): Promise<OnboardingProfile> {
    const profile = await this.store.get(sessionId);
    if (!profile) throw new DomainError("Your setup session expired. Start setup again.", "NOT_FOUND");
    return profile;
  }
}

export const onboardingStore = new OnboardingStore();
export const onboardingService = new OnboardingService(onboardingStore, createConnectionVerifier(getServerConfig()));
