import { NextResponse } from "next/server";
import { replayCompletedCase } from "@/src/lib/orchestrator";
import { caseResponse } from "@/src/lib/service";
import { jsonError } from "@/src/lib/http";

export async function POST() {
  try {
    const replay = await replayCompletedCase("demo");
    return NextResponse.json({ ...(await caseResponse()), replay });
  } catch (error) { return jsonError(error); }
}
