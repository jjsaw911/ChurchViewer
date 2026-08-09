/**
 * Subdomains the product itself needs, plus a few we'd regret handing out.
 * Checked at registration, so no church can claim one.
 */
export const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "static",
  "assets",
  "cdn",
  "mail",
  "smtp",
  "ftp",
  "blog",
  "help",
  "support",
  "status",
  "docs",
  "dev",
  "staging",
  "test",
  "churchviewer",
]);

/** Lower-case, hyphenated, DNS-label safe. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // drop accents left by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** Why this slug can't be used, or null if it's fine. */
export function validateSlug(slug: string): string | null {
  if (slug.length < 3) return "Use at least 3 characters.";
  if (slug.length > 40) return "Keep it to 40 characters or fewer.";
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return "Use lower-case letters, numbers, and hyphens only.";
  }
  if (slug.includes("--")) return "Avoid double hyphens.";
  if (RESERVED_SLUGS.has(slug)) return "That address is reserved.";
  return null;
}

/**
 * The tenant slug in a Host header, or null for the marketing site.
 * `grace.churchviewer.com` -> `grace`; `www.churchviewer.com` -> null.
 */
export function tenantFromHost(host: string | null, rootDomain: string): string | null {
  if (!host) return null;

  const hostname = host.split(":")[0].toLowerCase();
  const root = rootDomain.split(":")[0].toLowerCase();

  if (hostname === root) return null;
  if (!hostname.endsWith(`.${root}`)) return null;

  const label = hostname.slice(0, -(root.length + 1));
  // Only a single label is a tenant; anything deeper isn't ours to serve.
  if (!label || label.includes(".")) return null;
  if (RESERVED_SLUGS.has(label)) return null;

  return label;
}
