import { NextResponse } from "next/server";
import { executeCase } from "@/src/lib/orchestrator";
import { caseResponse } from "@/src/lib/service";
import { jsonError } from "@/src/lib/http";

export async function POST() {
  try { await executeCase("demo"); return NextResponse.json(await caseResponse()); }
  catch (error) { return jsonError(error); }
}
