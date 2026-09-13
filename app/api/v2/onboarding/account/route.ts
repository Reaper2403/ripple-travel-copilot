import { NextRequest } from "next/server";
import { jsonError } from "@/src/lib/http";
import { accountRequestSchema } from "@/src/lib/v2/contracts";
import { onboardingResponse, sessionForAccountRequest } from "@/src/lib/v2/http";
import { onboardingService } from "@/src/lib/v2/onboarding-service";
import { DomainError } from "@/src/lib/domain/errors";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const parsed = accountRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new DomainError("Enter a name to continue.", "INVALID_REQUEST");
    const session = await sessionForAccountRequest(request);
    return onboardingResponse(await onboardingService.saveAccount(session.sessionId, parsed.data.display_name), session.created);
  } catch (error) { return jsonError(error); }
}

