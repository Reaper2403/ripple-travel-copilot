import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/src/lib/http";
import { V2_SCHEMA_VERSION } from "@/src/lib/v2/contracts";
import { requestSessionId } from "@/src/lib/v2/http";
import { onboardingService } from "@/src/lib/v2/onboarding-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try { return NextResponse.json({ schema_version: V2_SCHEMA_VERSION, options: await onboardingService.calendarOptions(requestSessionId(request)) }); }
  catch (error) { return jsonError(error); }
}

