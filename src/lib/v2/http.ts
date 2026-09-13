import { NextRequest, NextResponse } from "next/server";
import { publicOnboardingProfile, type OnboardingProfile } from "./contracts";
import { onboardingService, V2_SESSION_COOKIE } from "./onboarding-service";
import { DomainError } from "../domain/errors";

export function requestSessionId(request: NextRequest): string {
  const sessionId = request.cookies.get(V2_SESSION_COOKIE)?.value;
  if (!sessionId) throw new DomainError("Your setup session expired. Start setup again.", "NOT_FOUND");
  return sessionId;
}

export function onboardingResponse(profile: OnboardingProfile, setSessionCookie = false): NextResponse {
  const response = NextResponse.json(publicOnboardingProfile(profile));
  if (setSessionCookie) {
    response.cookies.set(V2_SESSION_COOKIE, profile.session_id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
  }
  return response;
}

export async function sessionForAccountRequest(request: NextRequest): Promise<{ sessionId: string; created: boolean }> {
  const prior = request.cookies.get(V2_SESSION_COOKIE)?.value;
  const result = await onboardingService.getOrCreate(prior);
  return { sessionId: result.profile.session_id, created: result.created };
}
