import { NextResponse, type NextRequest } from "next/server";
import { getMembershipRole, getSessionUser } from "@/lib/auth/session";
import { getChurchBySlug } from "@/lib/churches";
import { isOpenAiConfigured } from "@/lib/ai/openai";
import { getSong, transcribeSong } from "@/lib/songs/service";

/**
 * Kicks off transcription and waits for it. A five-minute song comes back well
 * inside a normal request, and the song row records the outcome either way, so
 * a dropped connection doesn't lose the result.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    tenant?: string;
    slug?: string;
    tidy?: boolean;
  } | null;

  if (!body?.tenant || !body.slug) {
    return NextResponse.json({ error: "Missing tenant or song." }, { status: 400 });
  }

  const church = await getChurchBySlug(body.tenant);
  if (!church) return NextResponse.json({ error: "Unknown church." }, { status: 404 });

  const role = await getMembershipRole(user.id, church.id);
  if (!role) {
    return NextResponse.json({ error: "You can't edit this church's songs." }, { status: 403 });
  }

  if (!isOpenAiConfigured()) {
    return NextResponse.json(
      { error: "No OpenAI key is configured on the server yet." },
      { status: 501 },
    );
  }

  const song = await getSong(church.id, body.slug);
  if (!song) return NextResponse.json({ error: "Unknown song." }, { status: 404 });

  try {
    const { slides } = await transcribeSong({
      churchId: church.id,
      songId: song.id,
      tidy: body.tidy !== false,
    });
    return NextResponse.json({ slides });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transcription failed." },
      { status: 502 },
    );
  }
}
