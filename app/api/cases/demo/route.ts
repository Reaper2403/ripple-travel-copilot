import { NextResponse } from "next/server";
import type { CreateDemoCaseRequest } from "@/src/lib/api-contract";
import { analyzeCase, ensureDemoCase, resetDemoCase, resetDemoFromInbox } from "@/src/lib/orchestrator";
import { getServerConfig } from "@/src/lib/config";
import { caseResponse } from "@/src/lib/service";
import { jsonError } from "@/src/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    let item = await ensureDemoCase();
    if (item.status === "INGESTED" || item.status === "NEEDS_CLARIFICATION") {
      item = await analyzeCase("demo", getServerConfig().PROVIDER_MODE !== "real");
    }
    return NextResponse.json(await caseResponse(item.case_id));
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as CreateDemoCaseRequest;
    if (getServerConfig().PROVIDER_MODE === "real") await resetDemoFromInbox();
    else await resetDemoCase(body.scenario ?? "cancellation");
    await analyzeCase("demo", getServerConfig().PROVIDER_MODE !== "real");
    return NextResponse.json(await caseResponse(), { status: 201 });
  } catch (error) { return jsonError(error); }
}
