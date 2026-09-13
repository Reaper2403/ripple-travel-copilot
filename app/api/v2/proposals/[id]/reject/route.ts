import { NextRequest, NextResponse } from "next/server";
import { DomainError } from "@/src/lib/domain/errors";
import { jsonError } from "@/src/lib/http";
import { rejectProposalRequestSchema } from "@/src/lib/v2/contracts";
import { requestSessionId } from "@/src/lib/v2/http";
import { proposalService } from "@/src/lib/v2/proposal-service";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: RouteContext<"/api/v2/proposals/[id]/reject">) {
  try { const parsed = rejectProposalRequestSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) throw new DomainError("Reject the current proposal version.", "INVALID_REQUEST"); const { id } = await context.params; return NextResponse.json(await proposalService.reject(requestSessionId(request), id, parsed.data.expected_version)); }
  catch (error) { return jsonError(error); }
}
