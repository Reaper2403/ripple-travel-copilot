import type { Provider, SetupStep } from "./types";

export const setupOrder: SetupStep[] = ["account", "gmail", "calendar", "notion", "complete"];

export const setupMeta: Record<Exclude<SetupStep, "workspace">, { short: string; eyebrow: string; title: string; body: string }> = {
  account: {
    short: "Welcome",
    eyebrow: "Welcome to Ripple",
    title: "Your schedule can recover itself.",
    body: "Ripple finds schedule risk, prepares a practical response, and acts only after you approve.",
  },
  gmail: {
    short: "Email",
    eyebrow: "Email connection",
    title: "Spot travel changes as they arrive.",
    body: "Ripple checks likely travel notices, shows the evidence it used, and sends updates only after your approval.",
  },
  calendar: {
    short: "Schedule",
    eyebrow: "Schedule connection",
    title: "See what a delay puts at risk.",
    body: "Ripple checks commitments around your arrival and finds space for preparation, focus, and recovery.",
  },
  notion: {
    short: "Knowledge",
    eyebrow: "Knowledge base",
    title: "Turn every recovery into follow-through.",
    body: "Ripple creates a living Notion workspace with the decision, affected commitments, owners, deadlines, and next steps.",
  },
  complete: {
    short: "Meet Ripple",
    eyebrow: "Your assistant is ready",
    title: "What should Ripple keep an eye on?",
    body: "Ask about your schedule, review a new disruption, or explore a better shape for your week.",
  },
};

export const providerLabels: Record<Provider, string> = {
  gmail: "Gmail",
  calendar: "Google Calendar",
  notion: "Notion",
};

export function connectionLabel(mode: "real" | "fixture"): string {
  return mode === "real" ? "Connected" : "Demo connection ready";
}

export function connectionStatusLabel(status: "not_started" | "verifying" | "verified" | "needs_attention", mode: "real" | "fixture"): string {
  if (status === "verified") return connectionLabel(mode);
  if (status === "verifying") return "Checking connection";
  if (status === "needs_attention") return "Needs attention";
  return "Not checked";
}

export function isConnectionCurrent(connection: { status: string; valid_until?: string }, at = Date.now()): boolean {
  return connection.status === "verified" && Boolean(connection.valid_until) && Date.parse(connection.valid_until as string) > at;
}

export function stepPath(step: SetupStep): string {
  if (step === "account") return "/welcome";
  if (step === "workspace") return "/workspace";
  return `/setup/${step === "gmail" ? "email" : step === "notion" ? "knowledge" : step}`;
}

export function backStepFor(step: SetupStep): SetupStep | undefined {
  return ({ gmail: "account", calendar: "gmail", notion: "calendar", complete: "notion" } as Partial<Record<SetupStep, SetupStep>>)[step];
}
