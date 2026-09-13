import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { DomainError } from "./domain/errors";

export function jsonError(error: unknown): NextResponse {
  const trace_id = randomUUID();
  if (error instanceof DomainError) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_REQUEST" ? 400 : error.code === "STALE_APPROVAL" ? 409 : 422;
    return NextResponse.json({ code: error.code, retryable: false, safe_message: error.message, trace_id }, { status });
  }
  return NextResponse.json({ code: "PROVIDER_FAILURE", retryable: false, safe_message: "The request could not be completed safely.", trace_id }, { status: 500 });
}
