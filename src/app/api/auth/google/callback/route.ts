import { NextResponse, type NextRequest } from "next/server";
import { upsertGoogleUser } from "@/lib/auth/accounts";
import {
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  exchangeCode,
} from "@/lib/auth/google";
import { issueSession } from "@/lib/auth/session";
import { rootUrl } from "@/lib/env";

const failure = (message: string) =>
  NextResponse.redirect(rootUrl(`/login?error=${encodeURIComponent(message)}`));

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  if (params.get("error")) return failure("Google sign-in was cancelled.");

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const verifier = request.cookies.get(OAUTH_VERIFIER_COOKIE)?.value;

  // The state cookie is what ties this callback to a sign-in *we* started.
  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return failure("That sign-in link expired. Try again.");
  }

  let userId: string;
  try {
    const identity = await exchangeCode(code, verifier);
    userId = await upsertGoogleUser(identity);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Google sign-in failed.");
  }

  const session = await issueSession(userId);

  const next = request.cookies.get(OAUTH_NEXT_COOKIE)?.value;
  const response = NextResponse.redirect(rootUrl(next ?? "/register"));
  response.cookies.set(session.name, session.value, session.options);
  for (const name of [OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, OAUTH_NEXT_COOKIE]) {
    response.cookies.delete(name);
  }
  return response;
}
