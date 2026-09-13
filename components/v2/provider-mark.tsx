import type { Provider } from "./types";

export function ProviderMark({ provider }: { provider: Provider }) {
  return <span className={`v2-provider-mark is-${provider}`} aria-hidden="true">{provider === "gmail" ? "M" : provider === "calendar" ? "31" : "N"}</span>;
}
