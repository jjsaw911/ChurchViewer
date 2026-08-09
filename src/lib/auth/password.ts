import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

// The 4-argument (with options) overload, pinned so promisify picks it.
const scryptAsync = promisify<string, Buffer, number, ScryptOptions, Buffer>(scrypt);

// Node's own scrypt — no native build step to break on a fresh VM.
const KEY_LENGTH = 64;
const PARAMS = { N: 16384, r: 8, p: 1 };

/** `scrypt$N$r$p$salt$hash`, everything after the params base64url-encoded. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, PARAMS);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  const expected = Buffer.from(hash, "base64url");
  const derived = await scryptAsync(password, Buffer.from(salt, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Deliberately mild: length carries far more weight than character classes. */
export function checkPasswordStrength(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "That password is too long.";
  return null;
}
