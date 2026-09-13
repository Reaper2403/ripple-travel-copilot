import { NextRequest, NextResponse } from "next/server";
import { DomainError } from "@/src/lib/domain/errors";
import { jsonError } from "@/src/lib/http";
import { createConversationRequestSchema, publicConversationView } from "@/src/lib/v2/contracts";
import { conversationService } from "@/src/lib/v2/conversation-service";
import { requestSessionId } from "@/src/lib/v2/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const parsed = createConversationRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new DomainError("Choose a supported starting point.", "INVALID_REQUEST");
    return NextResponse.json(publicConversationView(await conversationService.create(requestSessionId(request), parsed.data.starter)), { status: 201 });
  } catch (error) { return jsonError(error); }
}
