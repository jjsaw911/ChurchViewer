import { NextResponse } from "next/server";
import { revokeCurrentSession } from "@/lib/auth/session";
import { rootUrl } from "@/lib/env";

/** Sign-out that works from a tenant subdomain too. */
export async function POST() {
  const cookieName = await revokeCurrentSession();
  const response = NextResponse.redirect(rootUrl("/"), { status: 303 });
  response.cookies.delete(cookieName);
  return response;
}
