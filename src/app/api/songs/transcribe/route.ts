import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { resolveAccess } from "@/lib/admin/guard";
import { getChurchBySlug } from "@/lib/churches";
import { isOpenAiConfigured } from "@/lib/ai/openai";
import { enqueueSongWork } from "@/lib/songs/queue";
import { getSong } from "@/lib/songs/service";

/** Resolve the caller against the church, or return the response to send back. */
async function authorize(tenant: string | undefined, slug: string | undefined) {
  if (!tenant || !slug) {
    return { error: NextResponse.json({ error: "Missing tenant or song." }, { status: 400 }) };
  }

  const user = await getSessionUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  }

  const church = await getChurchBySlug(tenant);
  if (!church) {
    return { error: NextResponse.json({ error: "Unknown church." }, { status: 404 }) };
  }

  // Platform admins are allowed in without membership — same rule as the pages.
  const access = await resolveAccess(user, church.id);
  if (!access) {
    return {
      error: NextResponse.json({ error: "You can't edit this church's songs." }, { status: 403 }),
    };
  }

  const song = await getSong(church.id, slug);
  if (!song) {
    return { error: NextResponse.json({ error: "Unknown song." }, { status: 404 }) };
  }

  return { church, song };
}

/**
 * Queue a transcription. Returns straight away — a song takes tens of seconds
 * and a sermon minutes, so the work belongs to the worker process, not to this
 * request. Poll GET for the outcome.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    tenant?: string;
    slug?: string;
    tidy?: boolean;
  } | null;

  const resolved = await authorize(body?.tenant, body?.slug);
  if ("error" in resolved) return resolved.error;

  if (!(await isOpenAiConfigured())) {
    return NextResponse.json(
      { error: "No OpenAI key is configured on the server yet." },
      { status: 501 },
    );
  }

  const queued = await enqueueSongWork({
    churchId: resolved.church.id,
    songId: resolved.song.id,
    tidy: body?.tidy !== false,
  });

  if (!queued) {
    return NextResponse.json(
      { error: "This song has no audio to transcribe yet." },
      { status: 409 },
    );
  }

  return NextResponse.json({ status: "queued" }, { status: 202 });
}

/** Where the job got to, for the editor to poll. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const resolved = await authorize(params.get("tenant") ?? undefined, params.get("slug") ?? undefined);
  if ("error" in resolved) return resolved.error;

  const { song } = resolved;
  return NextResponse.json({
    status: song.status,
    slides: song.slides,
    error: song.lastError,
    attempts: song.transcribeAttempts,
  });
}
