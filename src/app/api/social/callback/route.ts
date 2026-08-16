import { NextResponse, type NextRequest } from "next/server";
import { getChurchBySlug } from "@/lib/churches";
import { getSessionUser } from "@/lib/auth/session";
import { resolveAccess } from "@/lib/admin/guard";
import { exchangeCode, listDestinations, metaApp } from "@/lib/social/meta";
import { saveDestinations } from "@/lib/social/service";
import { rootUrl, tenantUrl } from "@/lib/env";

/**
 * Coming back from Facebook with a yes.
 *
 * On the main host, because that is the one address a Meta app can be told to
 * redirect to — a church per subdomain would mean registering every church with
 * Meta. So the church is worked out from the `state`, and checked twice: against
 * the cookie set when this started, and against this person's actual access to
 * that church. A redirect somebody else prepared satisfies neither.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = params.get("state") ?? "";
  const expected = request.cookies.get("cv_social_state")?.value ?? "";

  const fail = (slug: string | null, reason: string) =>
    NextResponse.redirect(
      slug
        ? tenantUrl(slug, `/admin/social?error=${encodeURIComponent(reason)}`)
        : rootUrl(`/register?error=${encodeURIComponent(reason)}`),
    );

  const slug = state.split(":")[0] || null;
  if (!state || state !== expected) return fail(slug, "That connection attempt expired.");

  const user = await getSessionUser();
  const church = slug ? await getChurchBySlug(slug) : null;
  if (!user || !church) return fail(slug, "Sign in and try again.");

  const access = await resolveAccess(user, church.id);
  if (!access) return fail(null, "Not your church.");

  if (params.get("error")) {
    return fail(slug, params.get("error_description") ?? "Facebook cancelled that.");
  }

  const code = params.get("code");
  const app = await metaApp();
  if (!code || !app) return fail(slug, "Nothing came back from Facebook.");

  const token = await exchangeCode(app, code, rootUrl("/api/social/callback"));
  if (!token.ok) return fail(slug, token.error);

  const found = await listDestinations(token.token);
  if (!found.ok) return fail(slug, found.error);

  if (found.destinations.length === 0) {
    return fail(
      slug,
      "That account manages no pages. A church page is what posts — a personal profile can't.",
    );
  }

  await saveDestinations(church.id, user.id, found.destinations);

  const response = NextResponse.redirect(tenantUrl(church.slug, "/admin/social?connected=1"));
  response.cookies.delete("cv_social_state");
  return response;
}
