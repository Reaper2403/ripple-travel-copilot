import { NextResponse } from "next/server";
import type { AnalyzeCaseRequest } from "@/src/lib/api-contract";
import { analyzeCase } from "@/src/lib/orchestrator";
import { caseResponse } from "@/src/lib/service";
import { jsonError } from "@/src/lib/http";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as AnalyzeCaseRequest;
    await analyzeCase("demo", body.force_fallback);
    return NextResponse.json(await caseResponse());
  } catch (error) { return jsonError(error); }
}
