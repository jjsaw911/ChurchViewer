import { NextResponse, type NextRequest } from "next/server";
import { requireChurchAccess } from "@/lib/admin/guard";
import { authorizeUrl, metaApp } from "@/lib/social/meta";
import { rootUrl } from "@/lib/env";
import { randomBytes } from "node:crypto";

/**
 * The start of connecting a page: off to Facebook to say yes.
 *
 * The church being connected travels in the `state`, signed by nothing and
 * checked on the way back against a cookie set here. That pairing is what stops
 * a redirect somebody else prepared from attaching their page to this church.
 */
export async function GET(request: NextRequest) {
  const tenant = request.nextUrl.searchParams.get("tenant") ?? "";
  const { church } = await requireChurchAccess(tenant);

  const app = await metaApp();
  if (!app) {
    return NextResponse.redirect(new URL("/admin/social?error=unconfigured", request.url));
  }

  const nonce = randomBytes(16).toString("base64url");
  const state = `${church.slug}:${nonce}`;

  const response = NextResponse.redirect(
    authorizeUrl(app, rootUrl("/api/social/callback"), state),
  );

  response.cookies.set("cv_social_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: rootUrl().startsWith("https"),
    path: "/",
    maxAge: 600,
  });

  return response;
}
