import { NextRequest, NextResponse } from "next/server";
import { DomainError } from "@/src/lib/domain/errors";
import { jsonError } from "@/src/lib/http";
import { selectProposalRequestSchema } from "@/src/lib/v2/contracts";
import { requestSessionId } from "@/src/lib/v2/http";
import { proposalService } from "@/src/lib/v2/proposal-service";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: RouteContext<"/api/v2/proposals/[id]/select">) {
  try { const parsed = selectProposalRequestSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) throw new DomainError("Choose a current scheduling option.", "INVALID_REQUEST"); const { id } = await context.params; return NextResponse.json(await proposalService.select(requestSessionId(request), id, parsed.data.expected_version, parsed.data.alternative_id)); }
  catch (error) { return jsonError(error); }
}
