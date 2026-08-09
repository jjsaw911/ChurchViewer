/**
 * Get ChurchViewer running on this machine from nothing.
 *
 *   npm run setup
 *   npm run setup -- --admin you@example.com
 *
 * Writes .env.local if it's missing, creates the database if it doesn't exist,
 * applies migrations, and seeds a demo church. Safe to run again — every step
 * checks before it acts, so it's the thing to run when you're not sure what
 * state a checkout is in.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const DEFAULT_DATABASE_URL = "postgresql://postgres@127.0.0.1:5432/churchviewer";

/**
 * `lvh.me` and every subdomain resolve to 127.0.0.1 through public DNS. Plain
 * `localhost` cannot work: browsers never send a localhost cookie to
 * sub.localhost, so you'd be signed out the moment you opened a church.
 */
const DEFAULT_ROOT_DOMAIN = "lvh.me:3000";

const step = (message: string) => console.log(`\n${message}`);
const done = (message: string) => console.log(`  ✓ ${message}`);

function ensureEnvFile(adminEmail: string | null): void {
  step("Checking .env.local");

  if (existsSync(".env.local")) {
    done(".env.local already exists — leaving it alone");

    if (adminEmail) {
      const current = readFileSync(".env.local", "utf8");
      if (current.includes(`PLATFORM_ADMIN_EMAILS=${adminEmail}`)) {
        done(`${adminEmail} is already a platform admin`);
      } else if (/^PLATFORM_ADMIN_EMAILS=.*$/m.test(current)) {
        writeFileSync(
          ".env.local",
          current.replace(/^PLATFORM_ADMIN_EMAILS=.*$/m, `PLATFORM_ADMIN_EMAILS=${adminEmail}`),
        );
        done(`set PLATFORM_ADMIN_EMAILS to ${adminEmail}`);
      } else {
        writeFileSync(".env.local", `${current}\nPLATFORM_ADMIN_EMAILS=${adminEmail}\n`);
        done(`added PLATFORM_ADMIN_EMAILS=${adminEmail}`);
      }
    }
    return;
  }

  const lines = [
    `DATABASE_URL=${process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL}`,
    `NEXT_PUBLIC_ROOT_DOMAIN=${DEFAULT_ROOT_DOMAIN}`,
    `PLATFORM_ADMIN_EMAILS=${adminEmail ?? ""}`,
    "",
    "# Optional. Without these the app still runs:",
    "#   no OpenAI key  -> the Transcribe button is disabled",
    "#   no GCS bucket  -> the admin accepts pasted media links only",
    "#   no Google IDs  -> the Google sign-in button is hidden",
    "OPENAI_API_KEY=",
    "GCS_BUCKET=",
    "GOOGLE_CLIENT_ID=",
    "GOOGLE_CLIENT_SECRET=",
    "",
  ];
  writeFileSync(".env.local", lines.join("\n"));
  done("wrote .env.local");
}

/** Split a connection string into the server and the database name. */
function splitDatabaseUrl(url: string): { serverUrl: string; database: string } {
  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "churchviewer";
  // Connect to the maintenance database to ask about, or create, the real one.
  parsed.pathname = "/postgres";
  return { serverUrl: parsed.toString(), database };
}

async function ensureDatabase(url: string): Promise<void> {
  step("Checking the database");
  const { serverUrl, database } = splitDatabaseUrl(url);

  const pool = new Pool({ connectionString: serverUrl });
  try {
    const { rows } = await pool.query("select 1 from pg_database where datname = $1", [database]);
    if (rows.length > 0) {
      done(`"${database}" already exists`);
      return;
    }
    // The name comes from the operator's own connection string, but it still
    // can't go in as a parameter — CREATE DATABASE takes an identifier.
    await pool.query(`create database "${database.replace(/"/g, '""')}"`);
    done(`created "${database}"`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `\n  ✗ Couldn't reach Postgres at ${new URL(serverUrl).host}.\n` +
        `    ${reason}\n\n` +
        "    Start Postgres, then run this again. On a Mac:\n" +
        "      brew install postgresql@16 && brew services start postgresql@16\n" +
        "    If your setup uses a different user or port, put the right\n" +
        "    connection string in DATABASE_URL in .env.local first.",
    );
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function applyMigrations(url: string): Promise<void> {
  step("Applying migrations");
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    done("schema is up to date");
  } finally {
    await pool.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const adminFlag = args.indexOf("--admin");
  const adminEmail =
    adminFlag !== -1 && args[adminFlag + 1] ? args[adminFlag + 1].trim().toLowerCase() : null;

  ensureEnvFile(adminEmail);

  // Re-read: .env.local may have only just been written.
  loadEnvConfig(process.cwd());
  const url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

  await ensureDatabase(url);
  await applyMigrations(url);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? DEFAULT_ROOT_DOMAIN;

  console.log("\nReady.\n");
  console.log(`  npm run dev        then open http://${rootDomain}`);
  console.log("  npm run db:seed    adds a demo church with a few recordings");

  if (adminEmail) {
    console.log(
      `\n  ${adminEmail} can administer every church once it has a login:\n` +
        `    npm run admin:create -- ${adminEmail}\n` +
        `  Then sign in at http://${rootDomain}/login and open http://${rootDomain}/admin`,
    );
  } else {
    console.log(
      "\n  To give yourself the platform console over every church, re-run as:\n" +
        "    npm run setup -- --admin you@example.com",
    );
  }
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
