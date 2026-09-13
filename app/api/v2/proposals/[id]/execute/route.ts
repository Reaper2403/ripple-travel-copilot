import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/src/lib/http";
import { requestSessionId } from "@/src/lib/v2/http";
import { proposalService } from "@/src/lib/v2/proposal-service";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: RouteContext<"/api/v2/proposals/[id]/execute">) {
  try { const { id } = await context.params; return NextResponse.json(await proposalService.execute(requestSessionId(request), id)); }
  catch (error) { return jsonError(error); }
}
