import { NextResponse } from "next/server";
import type { ApproveCaseRequest } from "@/src/lib/api-contract";
import { approveCase, executeCase } from "@/src/lib/orchestrator";
import { caseResponse } from "@/src/lib/service";
import { jsonError } from "@/src/lib/http";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ApproveCaseRequest;
    await approveCase("demo", body.plan_id, body.actor_id, body.case_version);
    if (body.execute !== false) await executeCase("demo");
    return NextResponse.json(await caseResponse());
  } catch (error) { return jsonError(error); }
}
