import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/src/lib/http";
import { conversationService } from "@/src/lib/v2/conversation-service";
import { requestSessionId } from "@/src/lib/v2/http";
import { publicConversationView } from "@/src/lib/v2/contracts";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext<"/api/v2/conversations/[id]">) {
  try {
    const { id } = await context.params;
    return NextResponse.json(publicConversationView(await conversationService.get(requestSessionId(request), id)));
  } catch (error) { return jsonError(error); }
}
