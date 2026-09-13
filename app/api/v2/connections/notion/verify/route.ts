import { NextRequest } from "next/server";
import { jsonError } from "@/src/lib/http";
import { onboardingResponse, requestSessionId } from "@/src/lib/v2/http";
import { onboardingService } from "@/src/lib/v2/onboarding-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try { return onboardingResponse(await onboardingService.verify(requestSessionId(request), "notion")); }
  catch (error) { return jsonError(error); }
}

