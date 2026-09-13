import { NextRequest } from "next/server";
import { jsonError } from "@/src/lib/http";
import { onboardingResponse } from "@/src/lib/v2/http";
import { onboardingService, V2_SESSION_COOKIE } from "@/src/lib/v2/onboarding-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const result = await onboardingService.getOrCreate(request.cookies.get(V2_SESSION_COOKIE)?.value);
    return onboardingResponse(result.profile, result.created);
  } catch (error) { return jsonError(error); }
}

