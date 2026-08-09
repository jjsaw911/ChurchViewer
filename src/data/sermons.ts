import type { Sermon } from "@/lib/types";

const BUCKET =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample";

const AUDIO_SAMPLE =
  "https://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3";

/**
 * Seed content. The media URLs point at Google's public sample bucket so the
 * player works out of the box — swap `media.src` for your own recordings (or
 * drop files in `public/media/` and use `/media/your-file.mp4`).
 */
export const sermons: Sermon[] = [
  {
    slug: "the-house-on-the-rock",
    title: "The House on the Rock",
    speaker: "Pastor Alina Reyes",
    seriesSlug: "sermon-on-the-mount",
    date: "2026-08-02",
    scripture: "Matthew 7:24–27",
    description:
      "Two houses, one storm, and the difference that only shows up under pressure. We close the Sermon on the Mount where Jesus does — with a question about foundations.",
    durationSeconds: 2196,
    media: {
      kind: "video",
      src: `${BUCKET}/BigBuckBunny.mp4`,
      poster: `${BUCKET}/images/BigBuckBunny.jpg`,
    },
  },
  {
    slug: "ask-seek-knock",
    title: "Ask, Seek, Knock",
    speaker: "Pastor Alina Reyes",
    seriesSlug: "sermon-on-the-mount",
    date: "2026-07-26",
    scripture: "Matthew 7:7–12",
    description:
      "Persistent prayer isn't about wearing God down. It's about who we become while we keep knocking.",
    durationSeconds: 1980,
    media: {
      kind: "video",
      src: `${BUCKET}/ElephantsDream.mp4`,
      poster: `${BUCKET}/images/ElephantsDream.jpg`,
    },
  },
  {
    slug: "do-not-worry",
    title: "Do Not Worry",
    speaker: "Rev. Daniel Okafor",
    seriesSlug: "sermon-on-the-mount",
    date: "2026-07-19",
    scripture: "Matthew 6:25–34",
    description:
      "Birds, lilies, and the arithmetic of anxiety. A message for anyone carrying tomorrow around today.",
    durationSeconds: 2040,
    media: {
      kind: "video",
      src: `${BUCKET}/ForBiggerJoyrides.mp4`,
      poster: `${BUCKET}/images/ForBiggerJoyrides.jpg`,
    },
  },
  {
    slug: "blessed-are-the-poor-in-spirit",
    title: "Blessed Are the Poor in Spirit",
    speaker: "Pastor Alina Reyes",
    seriesSlug: "sermon-on-the-mount",
    date: "2026-07-12",
    scripture: "Matthew 5:1–12",
    description:
      "The Beatitudes open with the least likely people being called blessed. We start the series by asking why.",
    durationSeconds: 2280,
    media: {
      kind: "video",
      src: `${BUCKET}/ForBiggerBlazes.mp4`,
      poster: `${BUCKET}/images/ForBiggerBlazes.jpg`,
    },
  },
  {
    slug: "i-lift-my-eyes",
    title: "I Lift My Eyes",
    speaker: "Rev. Daniel Okafor",
    seriesSlug: "psalms-of-ascent",
    date: "2026-06-28",
    scripture: "Psalm 121",
    description:
      "A traveling song for the uphill stretch — where help comes from when the hills themselves aren't the answer.",
    durationSeconds: 1860,
    media: {
      kind: "video",
      src: `${BUCKET}/Sintel.mp4`,
      poster: `${BUCKET}/images/Sintel.jpg`,
    },
  },
  {
    slug: "out-of-the-depths",
    title: "Out of the Depths",
    speaker: "Marguerite Bell",
    seriesSlug: "psalms-of-ascent",
    date: "2026-06-21",
    scripture: "Psalm 130",
    description:
      "Lament as an act of faith. What it means to cry out from the bottom and still watch for morning.",
    durationSeconds: 1740,
    media: {
      kind: "audio",
      src: AUDIO_SAMPLE,
      poster: `${BUCKET}/images/WeAreGoingOnBullrun.jpg`,
    },
  },
  {
    slug: "keeping-watch",
    title: "Keeping Watch",
    speaker: "Pastor Alina Reyes",
    seriesSlug: "advent",
    date: "2025-11-30",
    scripture: "Isaiah 9:2",
    description:
      "The first Sunday of Advent. Waiting is not passive — it is the posture of people who expect the light to arrive.",
    durationSeconds: 1620,
    media: {
      kind: "video",
      src: `${BUCKET}/TearsOfSteel.mp4`,
      poster: `${BUCKET}/images/TearsOfSteel.jpg`,
    },
  },
  {
    slug: "a-service-of-lessons-and-carols",
    title: "A Service of Lessons and Carols",
    speaker: "Congregation",
    seriesSlug: null,
    date: "2025-12-21",
    scripture: "Luke 2:1–20",
    description:
      "The full recording of our candlelight service, from the first lesson through the last carol.",
    durationSeconds: 3900,
    media: {
      kind: "video",
      src: `${BUCKET}/VolkswagenGTIReview.mp4`,
      poster: `${BUCKET}/images/VolkswagenGTIReview.jpg`,
    },
  },
];
