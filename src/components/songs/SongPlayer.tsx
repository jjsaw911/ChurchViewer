"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** What the slide views need from whichever player is in use. */
export type PlayerControls = {
  play(): void;
  pause(): void;
  seekToMs(ms: number): void;
  positionMs(): number;
};

type Props = {
  /** YouTube video id — takes precedence when both are present. */
  videoId?: string | null;
  /** Direct audio URL, used when there's no video. */
  audioUrl?: string | null;
  /** Fires roughly ten times a second while playing. */
  onTime: (positionMs: number) => void;
  onDuration?: (durationMs: number) => void;
  onControls?: (controls: PlayerControls) => void;
  className?: string;
};

type YouTubePlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
};

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    config: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: { onReady?: () => void };
    },
  ) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Load YouTube's iframe API once, however many players end up on the page. */
function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);

  return new Promise((resolve) => {
    const existing = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      existing?.();
      resolve(window.YT as YouTubeApi);
    };

    if (!document.getElementById("youtube-iframe-api")) {
      const script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });
}

export default function SongPlayer({
  videoId,
  audioUrl,
  onTime,
  onDuration,
  onControls,
  className,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [failed, setFailed] = useState(false);

  // Keep the callbacks in refs — the polling loop should never be torn down and
  // rebuilt just because a parent re-rendered. Syncing them in an effect rather
  // than during render is what React's rules of refs require.
  const onTimeRef = useRef(onTime);
  const onDurationRef = useRef(onDuration);

  useEffect(() => {
    onTimeRef.current = onTime;
    onDurationRef.current = onDuration;
  }, [onTime, onDuration]);

  const publish = useCallback(
    (controls: PlayerControls) => onControls?.(controls),
    [onControls],
  );

  // --- YouTube
  useEffect(() => {
    if (!videoId || !mountRef.current) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    loadYouTubeApi()
      .then((api) => {
        if (cancelled || !mountRef.current) return;

        const player = new api.Player(mountRef.current, {
          videoId,
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: () => {
              onDurationRef.current?.(Math.round(player.getDuration() * 1000));
            },
          },
        });
        playerRef.current = player;

        timer = setInterval(() => {
          const seconds = player.getCurrentTime?.() ?? 0;
          onTimeRef.current(Math.round(seconds * 1000));
        }, 100);

        publish({
          play: () => player.playVideo(),
          pause: () => player.pauseVideo(),
          seekToMs: (ms) => player.seekTo(ms / 1000, true),
          positionMs: () => Math.round((player.getCurrentTime?.() ?? 0) * 1000),
        });
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId, publish]);

  // --- Plain audio
  useEffect(() => {
    if (videoId || !audioUrl) return;
    const el = audioRef.current;
    if (!el) return;

    const tick = () => onTimeRef.current(Math.round(el.currentTime * 1000));
    const meta = () => onDurationRef.current?.(Math.round(el.duration * 1000));

    el.addEventListener("timeupdate", tick);
    el.addEventListener("seeking", tick);
    el.addEventListener("loadedmetadata", meta);
    // timeupdate alone is too coarse for slide changes to look deliberate.
    const timer = setInterval(tick, 100);

    publish({
      play: () => void el.play(),
      pause: () => el.pause(),
      seekToMs: (ms) => {
        el.currentTime = ms / 1000;
      },
      positionMs: () => Math.round(el.currentTime * 1000),
    });

    return () => {
      clearInterval(timer);
      el.removeEventListener("timeupdate", tick);
      el.removeEventListener("seeking", tick);
      el.removeEventListener("loadedmetadata", meta);
    };
  }, [videoId, audioUrl, publish]);

  if (videoId) {
    return (
      <div className={className}>
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
          <div ref={mountRef} className="h-full w-full" />
        </div>
        {failed ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            Couldn&rsquo;t load the YouTube player — check the connection.
          </p>
        ) : null}
      </div>
    );
  }

  if (audioUrl) {
    return (
      <div className={className}>
        <audio ref={audioRef} controls preload="metadata" src={audioUrl} className="w-full" />
      </div>
    );
  }

  return (
    <p className={`text-sm text-stone-500 ${className ?? ""}`}>
      Add a YouTube link or an audio file to play this song.
    </p>
  );
}
