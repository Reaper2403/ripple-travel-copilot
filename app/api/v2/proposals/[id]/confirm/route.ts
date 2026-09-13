import { NextRequest, NextResponse } from "next/server";
import { DomainError } from "@/src/lib/domain/errors";
import { jsonError } from "@/src/lib/http";
import { confirmProposalRequestSchema } from "@/src/lib/v2/contracts";
import { requestSessionId } from "@/src/lib/v2/http";
import { proposalService } from "@/src/lib/v2/proposal-service";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: RouteContext<"/api/v2/proposals/[id]/confirm">) {
  try { const parsed = confirmProposalRequestSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) throw new DomainError("Confirmation does not match the action preview.", "INVALID_REQUEST"); const { id } = await context.params; return NextResponse.json(await proposalService.confirm(requestSessionId(request), id, parsed.data)); }
  catch (error) { return jsonError(error); }
}
