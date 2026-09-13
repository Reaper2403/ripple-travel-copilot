import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DomainError } from "../domain/errors";
import type { OnboardingProfile } from "./contracts";

interface V2StoredState {
  onboarding: Record<string, OnboardingProfile>;
  calendar_selections?: Record<string, string>;
}

export class OnboardingStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filename = path.join(process.cwd(), ".data", "v2-onboarding.json")) {}

  private async read(): Promise<V2StoredState> {
    try {
      return JSON.parse(await readFile(this.filename, "utf8")) as V2StoredState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { onboarding: {} };
      throw error;
    }
  }

  private async write(state: V2StoredState): Promise<void> {
    await mkdir(path.dirname(this.filename), { recursive: true });
    const temporary = `${this.filename}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
    await rename(temporary, this.filename);
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async get(sessionId: string): Promise<OnboardingProfile | undefined> {
    return structuredClone((await this.read()).onboarding[sessionId]);
  }

  async save(profile: OnboardingProfile, expectedVersion?: number): Promise<OnboardingProfile> {
    return this.serialized(async () => {
      const state = await this.read();
      const existing = state.onboarding[profile.session_id];
      if (expectedVersion !== undefined && existing?.version !== expectedVersion) {
        throw new DomainError("Setup changed in another request. Refresh and try again.", "STALE_APPROVAL");
      }
      state.onboarding[profile.session_id] = structuredClone(profile);
      await this.write(state);
      return structuredClone(profile);
    });
  }

  async saveCalendarSelection(sessionId: string, providerCalendarId: string): Promise<void> {
    await this.serialized(async () => {
      const state = await this.read();
      if (!state.onboarding[sessionId]) throw new DomainError("Your setup session expired. Start setup again.", "NOT_FOUND");
      state.calendar_selections ??= {};
      state.calendar_selections[sessionId] = providerCalendarId;
      await this.write(state);
    });
  }

  async saveVerifiedCalendar(profile: OnboardingProfile, expectedVersion: number, providerCalendarId: string): Promise<OnboardingProfile> {
    return this.serialized(async () => {
      const state = await this.read();
      const existing = state.onboarding[profile.session_id];
      if (!existing || existing.version !== expectedVersion) throw new DomainError("Setup changed in another request. Refresh and try again.", "STALE_APPROVAL");
      state.onboarding[profile.session_id] = structuredClone(profile);
      state.calendar_selections ??= {};
      state.calendar_selections[profile.session_id] = providerCalendarId;
      await this.write(state);
      return structuredClone(profile);
    });
  }

  async getCalendarSelection(sessionId: string): Promise<string | undefined> {
    return (await this.read()).calendar_selections?.[sessionId];
  }
}
