import { NextRequest, NextResponse } from "next/server";
import { DomainError } from "@/src/lib/domain/errors";
import { jsonError } from "@/src/lib/http";
import { publicConversationView, sendConversationMessageRequestSchema } from "@/src/lib/v2/contracts";
import { conversationService } from "@/src/lib/v2/conversation-service";
import { requestSessionId } from "@/src/lib/v2/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext<"/api/v2/conversations/[id]/messages">) {
  try {
    const parsed = sendConversationMessageRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new DomainError("Ask Ripple a scheduling question to continue.", "INVALID_REQUEST");
    const { id } = await context.params;
    return NextResponse.json(publicConversationView(await conversationService.send(requestSessionId(request), id, parsed.data)));
  } catch (error) { return jsonError(error); }
}
