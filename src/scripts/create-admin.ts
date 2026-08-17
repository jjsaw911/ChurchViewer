/**
 * Create (or reset the password of) a platform administrator.
 *
 *   npm run admin:create -- you@example.com
 *   npm run admin:create -- you@example.com --reset
 *
 * A platform admin is an account and nothing else: no church, no membership.
 * That's the whole reason this script exists — `/register` on the site creates
 * a church as part of signing up, so there was no way to get an administrator
 * who sits above every church rather than inside one.
 *
 * It refuses any address that isn't already in PLATFORM_ADMIN_EMAILS. The
 * allowlist is what grants the power; this only creates the login that uses it,
 * so the two can't drift apart and there's no way to mint an admin by running
 * this alone.
 *
 * Deliberately not a web route. A public "claim the admin account" endpoint is
 * a race — whoever guesses the address first wins it — and there's no good
 * answer to that on a site anyone can reach. Requiring shell access on the
 * server means the person creating the account already holds the box.
 */
import { createInterface } from "node:readline";
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { hashPassword, checkPasswordStrength } from "@/lib/auth/password";
import { users } from "@/db/schema";

/**
 * Answers piped in rather than typed. Read once, up front: each prompt opens
 * its own reader, and closing the first one ends a piped stdin, so reading
 * lazily hangs on the second question.
 */
let piped: string[] | null = null;

async function readPipedAnswers(): Promise<string[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").split("\n");
}

async function nextPipedAnswer(question: string): Promise<string> {
  piped ??= await readPipedAnswers();
  const answer = piped.shift();
  if (answer === undefined) die(`Ran out of piped input at: ${question.trim()}`);
  process.stdout.write(`${question}\n`);
  return answer.trim();
}

function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) return nextPipedAnswer(question);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

/**
 * Same, but nothing is echoed — this runs on a server, often over someone's
 * shoulder. With no terminal there is nothing to echo to, so the piped answer
 * is used instead; the password still never appears in argv or shell history.
 */
function askSecret(question: string): Promise<string> {
  if (!process.stdin.isTTY) return nextPipedAnswer(question);

  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const internal = rl as unknown as { _writeToOutput: (text: string) => void };
    const passthrough = internal._writeToOutput.bind(rl);
    let muted = false;
    internal._writeToOutput = (text: string) => {
      if (!muted) passthrough(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    // The prompt itself is written synchronously by `question`, so muting here
    // hides the typing without hiding the question.
    muted = true;
  });
}

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  loadEnvConfig(process.cwd());

  const url = process.env.DATABASE_URL;
  if (!url) die("DATABASE_URL is not set.");

  const allowlist = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length === 0) {
    die(
      "PLATFORM_ADMIN_EMAILS is empty, so no address can administer the platform.\n" +
        "Set it in .env.local first, then restart the service and re-run this.",
    );
  }

  const args = process.argv.slice(2);
  const reset = args.includes("--reset");
  const email = (args.find((arg) => !arg.startsWith("--")) ?? (await ask("Email: ")))
    .trim()
    .toLowerCase();

  if (!allowlist.includes(email)) {
    die(
      `${email} is not in PLATFORM_ADMIN_EMAILS, so the console would refuse it.\n` +
        `Currently allowed: ${allowlist.join(", ")}`,
    );
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  try {
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (existing && !reset) {
      die(
        `An account for ${email} already exists — just sign in at /login.\n` +
          "To set a new password for it, re-run with --reset.",
      );
    }

    const name = existing
      ? existing.name
      : (await ask("Name: ")) || email.split("@")[0];

    const password = await askSecret("Password (min 10 characters, not echoed): ");
    const problem = checkPasswordStrength(password);
    if (problem) die(problem);
    if ((await askSecret("Confirm: ")) !== password) die("Those didn't match.");

    const passwordHash = await hashPassword(password);

    if (existing) {
      await db.update(users).set({ passwordHash }).where(eq(users.id, existing.id));
      console.log(`\nPassword reset for ${email}.`);
    } else {
      await db.insert(users).values({ name, email, passwordHash });
      console.log(`\nCreated ${email} — an account with no church attached.`);
    }

    console.log("Sign in at /login; the console is at /admin on the apex.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
