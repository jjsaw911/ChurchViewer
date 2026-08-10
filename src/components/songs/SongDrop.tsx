"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileDrop from "@/components/media/FileDrop";
import { uploadToLibrary } from "@/lib/media/upload";
import { createSongFromFileAction } from "@/lib/songs/actions";

type Line = { name: string; state: string };

/**
 * Drop a recording here and it becomes a song with slides.
 *
 * The whole chain behind one gesture: the file goes to storage, into the media
 * library, becomes a song, and joins the worker's queue — which takes the audio
 * off a video and transcribes it. Several at once, because after a Sunday
 * there's rarely just one.
 */
export default function SongDrop({
  tenant,
  uploadsEnabled,
}: {
  tenant: string;
  uploadsEnabled: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  if (!uploadsEnabled) {
    return (
      <p className="rounded-xl border border-dashed border-stone-300 p-4 text-center text-sm text-stone-500 dark:border-stone-700">
        File uploads aren&apos;t configured on this server, so songs have to point at a link.
      </p>
    );
  }

  const say = (name: string, state: string) =>
    setLines((current) => {
      const next = current.filter((line) => line.name !== name);
      return [...next, { name, state }];
    });

  async function handle(files: File[]) {
    setBusy(true);

    for (const file of files) {
      try {
        say(file.name, "uploading…");
        const item = await uploadToLibrary(tenant, file, (percent) =>
          say(file.name, `uploading ${percent}%`),
        );

        say(file.name, "making a song…");
        const created = await createSongFromFileAction({
          tenant,
          location: item.location,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
        });

        say(
          file.name,
          created.ok
            ? `added as “${created.title}” — the worker has it now`
            : created.error,
        );
      } catch (error) {
        say(file.name, error instanceof Error ? error.message : "failed");
      }
    }

    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <FileDrop
        onFiles={handle}
        accept="audio/*,video/*"
        busy={busy}
        label={busy ? "Working…" : "Drop a recording here, or click to choose files"}
        hint="A service video or an mp3. The audio is pulled out of video for you, then transcribed into slides."
      />

      {lines.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {lines.map((line) => (
            <li key={line.name} className="flex flex-wrap gap-2">
              <span className="font-medium">{line.name}</span>
              <span className="text-stone-500">{line.state}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
