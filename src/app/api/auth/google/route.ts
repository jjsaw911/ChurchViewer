import { NextResponse, type NextRequest } from "next/server";
import {
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  authorizationUrl,
  createPkcePair,
} from "@/lib/auth/google";
import { env, rootUrl, usesHttps } from "@/lib/env";

/** Starts the Google sign-in dance. */
export function GET(request: NextRequest) {
  if (!env.google.isConfigured) {
    return NextResponse.redirect(rootUrl("/login?error=Google+sign-in+is+not+configured"));
  }

  const { verifier, challenge, state } = createPkcePair();
  const response = NextResponse.redirect(authorizationUrl(challenge, state));

  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: usesHttps(),
    path: "/",
    maxAge: 10 * 60,
  };
  response.cookies.set(OAUTH_STATE_COOKIE, state, options);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, options);

  const next = request.nextUrl.searchParams.get("next");
  if (next?.startsWith("/") && !next.startsWith("//")) {
    response.cookies.set(OAUTH_NEXT_COOKIE, next, options);
  }

  return response;
}
