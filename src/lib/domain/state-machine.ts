import { DomainError } from "./errors";
import type { CaseState, RecoveryCase } from "./types";

const transitions: Record<CaseState, readonly CaseState[]> = {
  INGESTED: ["ANALYZING", "NEEDS_CLARIFICATION"],
  ANALYZING: ["NEEDS_CLARIFICATION", "READY_FOR_REVIEW"],
  NEEDS_CLARIFICATION: ["ANALYZING"],
  READY_FOR_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["READY_FOR_REVIEW", "EXECUTING"],
  REJECTED: [],
  EXECUTING: ["COMPLETED", "PARTIALLY_COMPLETED"],
  COMPLETED: [],
  PARTIALLY_COMPLETED: ["EXECUTING", "NEEDS_MANUAL_REVIEW"],
  NEEDS_MANUAL_REVIEW: [],
};

export function canTransition(from: CaseState, to: CaseState): boolean {
  return transitions[from].includes(to);
}

export function transition(item: RecoveryCase, to: CaseState, now: string): RecoveryCase {
  if (!canTransition(item.status, to)) {
    throw new DomainError(`Cannot transition case from ${item.status} to ${to}.`, "INVALID_STATE");
  }
  return { ...item, status: to, version: item.version + 1, updated_at: now };
}
