import { NextResponse, type NextRequest } from "next/server";
import { tenantFromHost } from "@/lib/tenant";

/**
 * Maps `<church>.churchviewer.com/*` onto the `/s/<church>/*` routes, so the
 * app can stay a plain Next.js route tree while every church gets its own host.
 * The apex and `www` fall through to the marketing site untouched.
 */
export function proxy(request: NextRequest) {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const tenant = tenantFromHost(request.headers.get("host"), rootDomain);
  if (!tenant) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/s/${tenant}${request.nextUrl.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything except Next internals, the API surface, and static files.
  matcher: ["/((?!_next/|api/|favicon.ico|.*\\.[\\w]+$).*)"],
};
