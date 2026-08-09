import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { hashPassword } from "@/lib/auth/password";
import { churches, memberships, sermons, series, users } from "./schema";

async function main() {
  loadEnvConfig(process.cwd());

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  const BUCKET = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample";
  const AUDIO =
    "https://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3";

  const DEMO_EMAIL = "demo@churchviewer.com";
  const DEMO_PASSWORD = "sunday-morning";

  const existing = await db.select().from(churches).where(eq(churches.slug, "grace")).limit(1);
  if (existing[0]) {
    console.log("Demo church already seeded — nothing to do.");
    await pool.end();
    process.exit(0);
  }

  const [owner] = await db
    .insert(users)
    .values({
      name: "Demo Admin",
      email: DEMO_EMAIL,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      emailVerifiedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: users.id });

  const ownerId =
    owner?.id ??
    (await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL)).limit(1))[0].id;

  const [church] = await db
    .insert(churches)
    .values({
      slug: "grace",
      name: "Grace Chapel",
      tagline: "Sunday services, on demand",
    })
    .returning({ id: churches.id });

  await db.insert(memberships).values({ churchId: church.id, userId: ownerId, role: "owner" });

  const seriesRows = await db
    .insert(series)
    .values([
      {
        churchId: church.id,
        slug: "sermon-on-the-mount",
        title: "The Sermon on the Mount",
        description:
          "Eight weeks through Matthew 5–7, walking the way of the kingdom from the Beatitudes to the house on the rock.",
        artworkSrc: `${BUCKET}/images/ElephantsDream.jpg`,
      },
      {
        churchId: church.id,
        slug: "psalms-of-ascent",
        title: "Psalms of Ascent",
        description:
          "The songs pilgrims sang on the road up to Jerusalem — for anyone in the middle of a long journey.",
        artworkSrc: `${BUCKET}/images/ForBiggerBlazes.jpg`,
      },
      {
        churchId: church.id,
        slug: "advent",
        title: "Advent: Keeping Watch",
        description: "Four candles, four weeks, one long-awaited arrival.",
        artworkSrc: `${BUCKET}/images/Sintel.jpg`,
      },
    ])
    .returning({ id: series.id, slug: series.slug });

  const seriesId = (slug: string) => seriesRows.find((row) => row.slug === slug)?.id ?? null;

  await db.insert(sermons).values([
    {
      churchId: church.id,
      slug: "the-house-on-the-rock",
      title: "The House on the Rock",
      speaker: "Pastor Alina Reyes",
      seriesId: seriesId("sermon-on-the-mount"),
      preachedOn: "2026-08-02",
      scripture: "Matthew 7:24–27",
      description:
        "Two houses, one storm, and the difference that only shows up under pressure. We close the Sermon on the Mount where Jesus does — with a question about foundations.",
      durationSeconds: 2196,
      mediaKind: "video",
      mediaSrc: `${BUCKET}/BigBuckBunny.mp4`,
      posterSrc: `${BUCKET}/images/BigBuckBunny.jpg`,
    },
    {
      churchId: church.id,
      slug: "ask-seek-knock",
      title: "Ask, Seek, Knock",
      speaker: "Pastor Alina Reyes",
      seriesId: seriesId("sermon-on-the-mount"),
      preachedOn: "2026-07-26",
      scripture: "Matthew 7:7–12",
      description:
        "Persistent prayer isn't about wearing God down. It's about who we become while we keep knocking.",
      durationSeconds: 1980,
      mediaKind: "video",
      mediaSrc: `${BUCKET}/ElephantsDream.mp4`,
      posterSrc: `${BUCKET}/images/ElephantsDream.jpg`,
    },
    {
      churchId: church.id,
      slug: "do-not-worry",
      title: "Do Not Worry",
      speaker: "Rev. Daniel Okafor",
      seriesId: seriesId("sermon-on-the-mount"),
      preachedOn: "2026-07-19",
      scripture: "Matthew 6:25–34",
      description:
        "Birds, lilies, and the arithmetic of anxiety. A message for anyone carrying tomorrow around today.",
      durationSeconds: 2040,
      mediaKind: "video",
      mediaSrc: `${BUCKET}/ForBiggerJoyrides.mp4`,
      posterSrc: `${BUCKET}/images/ForBiggerJoyrides.jpg`,
    },
    {
      churchId: church.id,
      slug: "blessed-are-the-poor-in-spirit",
      title: "Blessed Are the Poor in Spirit",
      speaker: "Pastor Alina Reyes",
      seriesId: seriesId("sermon-on-the-mount"),
      preachedOn: "2026-07-12",
      scripture: "Matthew 5:1–12",
      description:
        "The Beatitudes open with the least likely people being called blessed. We start the series by asking why.",
      durationSeconds: 2280,
      mediaKind: "video",
      mediaSrc: `${BUCKET}/ForBiggerBlazes.mp4`,
      posterSrc: `${BUCKET}/images/ForBiggerBlazes.jpg`,
    },
    {
      churchId: church.id,
      slug: "i-lift-my-eyes",
      title: "I Lift My Eyes",
      speaker: "Rev. Daniel Okafor",
      seriesId: seriesId("psalms-of-ascent"),
      preachedOn: "2026-06-28",
      scripture: "Psalm 121",
      description:
        "A traveling song for the uphill stretch — where help comes from when the hills themselves aren't the answer.",
      durationSeconds: 1860,
      mediaKind: "video",
      mediaSrc: `${BUCKET}/Sintel.mp4`,
      posterSrc: `${BUCKET}/images/Sintel.jpg`,
    },
    {
      churchId: church.id,
      slug: "out-of-the-depths",
      title: "Out of the Depths",
      speaker: "Marguerite Bell",
      seriesId: seriesId("psalms-of-ascent"),
      preachedOn: "2026-06-21",
      scripture: "Psalm 130",
      description:
        "Lament as an act of faith. What it means to cry out from the bottom and still watch for morning.",
      durationSeconds: 1740,
      mediaKind: "audio",
      mediaSrc: AUDIO,
      posterSrc: `${BUCKET}/images/WeAreGoingOnBullrun.jpg`,
    },
    {
      churchId: church.id,
      slug: "keeping-watch",
      title: "Keeping Watch",
      speaker: "Pastor Alina Reyes",
      seriesId: seriesId("advent"),
      preachedOn: "2025-11-30",
      scripture: "Isaiah 9:2",
      description:
        "The first Sunday of Advent. Waiting is not passive — it is the posture of people who expect the light to arrive.",
      durationSeconds: 1620,
      mediaKind: "video",
      mediaSrc: `${BUCKET}/TearsOfSteel.mp4`,
      posterSrc: `${BUCKET}/images/TearsOfSteel.jpg`,
    },
    {
      churchId: church.id,
      slug: "a-service-of-lessons-and-carols",
      title: "A Service of Lessons and Carols",
      speaker: "Congregation",
      seriesId: null,
      preachedOn: "2025-12-21",
      scripture: "Luke 2:1–20",
      description:
        "The full recording of our candlelight service, from the first lesson through the last carol.",
      durationSeconds: 3900,
      mediaKind: "video",
      mediaSrc: `${BUCKET}/VolkswagenGTIReview.mp4`,
      posterSrc: `${BUCKET}/images/VolkswagenGTIReview.jpg`,
    },
  ]);

  await pool.end();

  console.log(`Seeded Grace Chapel — sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

}

void main();
