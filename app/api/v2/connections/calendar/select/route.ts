import { NextRequest } from "next/server";
import { jsonError } from "@/src/lib/http";
import { DomainError } from "@/src/lib/domain/errors";
import { calendarSelectionRequestSchema } from "@/src/lib/v2/contracts";
import { onboardingResponse, requestSessionId } from "@/src/lib/v2/http";
import { onboardingService } from "@/src/lib/v2/onboarding-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const parsed = calendarSelectionRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new DomainError("Choose a calendar to continue.", "INVALID_REQUEST");
    return onboardingResponse(await onboardingService.selectCalendar(requestSessionId(request), parsed.data.selection_token));
  } catch (error) { return jsonError(error); }
}

