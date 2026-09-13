import type { ProviderError } from "./types";

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "INVALID_REQUEST" | "INVALID_STATE" | "STALE_APPROVAL" | "CONFIGURATION" | "PROVIDER_FAILURE",
  ) {
    super(message);
  }
}

export class AdapterError extends Error {
  constructor(readonly detail: ProviderError) {
    super(detail.safe_message);
  }
}
