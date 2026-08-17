/**
 * Unit checks for the logic that browser tests can't reach — mainly the
 * Google ID-token claim validation, where a missed check is a real auth hole.
 *
 * Run with `npm test`. Uses node:test so there's no test framework to install.
 */
import assert from "node:assert/strict";
import test from "node:test";

// Config is read lazily inside the functions under test, so setting it here
// (before any test runs) is enough.
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.NEXT_PUBLIC_ROOT_DOMAIN = "churchviewer.com";

import { readIdentity } from "@/lib/auth/google";
import { isPlatformAdminEmail } from "@/lib/env";
import { slugify, validateSlug, tenantFromHost } from "@/lib/tenant";
import { orderWithInsert, orderWithMove } from "@/lib/services/ordering";
import { parseClock, toClock, formatDuration } from "@/lib/format";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

/** Build an unsigned JWT with the given claims — only the payload is read. */
function idToken(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256" })}.${encode(claims)}.signature`;
}

const validClaims = {
  iss: "https://accounts.google.com",
  aud: "test-client-id",
  exp: Math.floor(Date.now() / 1000) + 3600,
  sub: "google-user-1",
  email: "Pastor@Example.ORG",
  email_verified: true,
  name: "Sam Pastor",
};

test("accepts a well-formed Google identity and lower-cases the email", () => {
  const identity = readIdentity(idToken(validClaims));
  assert.equal(identity.sub, "google-user-1");
  assert.equal(identity.email, "pastor@example.org");
  assert.equal(identity.emailVerified, true);
  assert.equal(identity.name, "Sam Pastor");
});

test("rejects a token minted for a different client", () => {
  assert.throws(
    () => readIdentity(idToken({ ...validClaims, aud: "someone-elses-client" })),
    /another client/,
  );
});

test("rejects a token from an unexpected issuer", () => {
  assert.throws(
    () => readIdentity(idToken({ ...validClaims, iss: "https://evil.example" })),
    /issuer/,
  );
});

test("rejects an expired token", () => {
  const expired = { ...validClaims, exp: Math.floor(Date.now() / 1000) - 60 };
  assert.throws(() => readIdentity(idToken(expired)), /expired/);
});

test("rejects a token with no subject or email", () => {
  assert.throws(() => readIdentity(idToken({ ...validClaims, sub: undefined })), /missing/);
  assert.throws(() => readIdentity(idToken({ ...validClaims, email: undefined })), /missing/);
});

test("falls back to the email's local part when Google sends no name", () => {
  // Keeps the original casing — it's a display name, not an identifier.
  assert.equal(readIdentity(idToken({ ...validClaims, name: "  " })).name, "Pastor");
});

test("carries through an unverified email rather than assuming it's fine", () => {
  const identity = readIdentity(idToken({ ...validClaims, email_verified: false }));
  assert.equal(identity.emailVerified, false);
});

test("slugify makes DNS-safe labels", () => {
  assert.equal(slugify("Grace Chapel"), "grace-chapel");
  assert.equal(slugify("  St. Mary's — Downtown  "), "st-mary-s-downtown");
  assert.equal(slugify("Iglesia Peñíel"), "iglesia-peniel");
  assert.equal(slugify("!!!"), "");
});

test("validateSlug refuses reserved and malformed addresses", () => {
  assert.equal(validateSlug("grace-chapel"), null);
  assert.match(validateSlug("www") ?? "", /reserved/);
  assert.match(validateSlug("admin") ?? "", /reserved/);
  assert.match(validateSlug("ab") ?? "", /3 characters/);
  assert.match(validateSlug("-nope") ?? "", /lower-case/);
  assert.match(validateSlug("Grace") ?? "", /lower-case/);
  assert.match(validateSlug("a--b") ?? "", /double hyphens/);
});

test("tenantFromHost only claims a single label under the root domain", () => {
  assert.equal(tenantFromHost("grace.churchviewer.com", "churchviewer.com"), "grace");
  assert.equal(tenantFromHost("grace.churchviewer.com:3000", "churchviewer.com:3000"), "grace");
  assert.equal(tenantFromHost("churchviewer.com", "churchviewer.com"), null);
  assert.equal(tenantFromHost("www.churchviewer.com", "churchviewer.com"), null);
  assert.equal(tenantFromHost("a.b.churchviewer.com", "churchviewer.com"), null);
  // A lookalike domain must never be read as one of our tenants.
  assert.equal(tenantFromHost("grace.churchviewer.com.evil.test", "churchviewer.com"), null);
  assert.equal(tenantFromHost("notchurchviewer.com", "churchviewer.com"), null);
  assert.equal(tenantFromHost(null, "churchviewer.com"), null);
});

test("duration input accepts clock and plain-minute forms", () => {
  assert.equal(parseClock("36:36"), 2196);
  assert.equal(parseClock("1:05:00"), 3900);
  assert.equal(parseClock("42"), 2520);
  assert.equal(parseClock(""), 0);
  assert.equal(toClock(2196), "36:36");
  assert.equal(formatDuration(3900), "1h 5m");
  assert.equal(formatDuration(0), "—");
});

test("password hashes verify, and wrong passwords don't", async () => {
  const hash = await hashPassword("a-long-enough-passphrase");
  assert.match(hash, /^scrypt\$/);
  assert.equal(await verifyPassword("a-long-enough-passphrase", hash), true);
  assert.equal(await verifyPassword("not-the-passphrase", hash), false);
  // A stored value we don't recognise must fail closed, not throw.
  assert.equal(await verifyPassword("whatever", "bcrypt$nonsense"), false);
});

test("platform admin allowlist fails closed and ignores case and spacing", () => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
  // Unset must mean nobody, never everybody.
  assert.equal(isPlatformAdminEmail("someone@example.com"), false);

  process.env.PLATFORM_ADMIN_EMAILS = "";
  assert.equal(isPlatformAdminEmail("someone@example.com"), false);

  process.env.PLATFORM_ADMIN_EMAILS = " Boss@Example.com , second@example.com ";
  assert.equal(isPlatformAdminEmail("boss@example.com"), true);
  assert.equal(isPlatformAdminEmail("BOSS@EXAMPLE.COM"), true);
  assert.equal(isPlatformAdminEmail("second@example.com"), true);
  assert.equal(isPlatformAdminEmail("nobody@example.com"), false);

  // A blank session email must never match a blank entry in the list.
  process.env.PLATFORM_ADMIN_EMAILS = "boss@example.com,,";
  assert.equal(isPlatformAdminEmail(""), false);
  assert.equal(isPlatformAdminEmail(null), false);
  assert.equal(isPlatformAdminEmail(undefined), false);

  delete process.env.PLATFORM_ADMIN_EMAILS;
});

test("inserting into a running order lands directly after the chosen item", () => {
  const order = ["a", "b", "c"];
  assert.deepEqual(orderWithInsert(order, "a", "new"), ["a", "new", "b", "c"]);
  assert.deepEqual(orderWithInsert(order, "b", "new"), ["a", "b", "new", "c"]);
  // Last item: the new one goes on the end, not before it.
  assert.deepEqual(orderWithInsert(order, "c", "new"), ["a", "b", "c", "new"]);
  // No anchor at all — the "add to the end" button.
  assert.deepEqual(orderWithInsert(order, "", "new"), ["a", "b", "c", "new"]);
  // Anchor deleted in another tab: append rather than throw away the input.
  assert.deepEqual(orderWithInsert(order, "gone", "new"), ["a", "b", "c", "new"]);
  assert.deepEqual(orderWithInsert([], "", "new"), ["new"]);
  // The source array must not be touched.
  assert.deepEqual(order, ["a", "b", "c"]);
});

test("moving an item stops at the ends instead of wrapping", () => {
  const order = ["a", "b", "c"];
  assert.deepEqual(orderWithMove(order, "b", "up"), ["b", "a", "c"]);
  assert.deepEqual(orderWithMove(order, "b", "down"), ["a", "c", "b"]);
  // Off either end is a no-op — a stale page can still send it.
  assert.deepEqual(orderWithMove(order, "a", "up"), ["a", "b", "c"]);
  assert.deepEqual(orderWithMove(order, "c", "down"), ["a", "b", "c"]);
  assert.deepEqual(orderWithMove(order, "gone", "up"), ["a", "b", "c"]);
  assert.deepEqual(order, ["a", "b", "c"]);
});
