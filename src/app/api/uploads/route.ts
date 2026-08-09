import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { resolveAccess } from "@/lib/admin/guard";
import { env } from "@/lib/env";
import { createUploadUrl } from "@/lib/storage";
import { getChurchBySlug } from "@/lib/churches";

const ALLOWED_PREFIXES = ["video/", "audio/", "image/"];
const ALLOWED_EXACT = ["text/vtt"];

/**
 * Hands back a short-lived signed URL so the browser can PUT the file straight
 * into the bucket. The recording never passes through this server.
 */
export async function POST(request: NextRequest) {
  // Authenticate before saying anything about how the server is configured.
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    tenant?: string;
    filename?: string;
    contentType?: string;
  } | null;

  if (!body?.tenant || !body.filename || !body.contentType) {
    return NextResponse.json({ error: "Missing tenant, filename, or contentType." }, { status: 400 });
  }

  const church = await getChurchBySlug(body.tenant);
  if (!church) return NextResponse.json({ error: "Unknown church." }, { status: 404 });

  // Platform admins are allowed in without membership — same rule as the pages.
  const access = await resolveAccess(user, church.id);
  if (!access) return NextResponse.json({ error: "You can't upload to this church." }, { status: 403 });

  if (!env.storage.isConfigured) {
    return NextResponse.json(
      { error: "File uploads aren't configured — paste a link instead." },
      { status: 501 },
    );
  }

  const contentType = body.contentType;
  const allowed =
    ALLOWED_PREFIXES.some((prefix) => contentType.startsWith(prefix)) ||
    ALLOWED_EXACT.includes(contentType);
  if (!allowed) {
    return NextResponse.json({ error: `${contentType} files aren't accepted.` }, { status: 415 });
  }

  const { uploadUrl, location } = await createUploadUrl({
    churchSlug: church.slug,
    filename: body.filename,
    contentType,
  });

  return NextResponse.json({ uploadUrl, location });
}
