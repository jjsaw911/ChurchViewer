/**
 * Runtime configuration. Everything optional has a sensible local default so
 * `npm run dev` works with nothing but a DATABASE_URL.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const env = {
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },

  /**
   * The domain tenants hang off. Locally this is `localhost:3000`, which real
   * browsers resolve for `anything.localhost` without touching /etc/hosts.
   */
  get rootDomain(): string {
    return process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  },

  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },

  google: {
    get clientId(): string {
      return required("GOOGLE_CLIENT_ID");
    },
    get clientSecret(): string {
      return required("GOOGLE_CLIENT_SECRET");
    },
    /** Google sign-in is simply hidden when it hasn't been configured. */
    get isConfigured(): boolean {
      return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    },
  },

  storage: {
    get bucket(): string {
      return required("GCS_BUCKET");
    },
    /** Without a bucket, the admin UI accepts external media URLs only. */
    get isConfigured(): boolean {
      return Boolean(process.env.GCS_BUCKET);
    },
  },
} as const;

/**
 * Hostnames that only ever mean "someone's laptop": plain localhost, the
 * reserved dev TLDs, and the wildcard-DNS helpers that resolve to 127.0.0.1.
 */
const LOCAL_HOST =
  /^(localhost|127\.0\.0\.1|\[::1\]|lvh\.me|localtest\.me)$|\.(localhost|test|local|lvh\.me|localtest\.me|nip\.io|sslip\.io)$/;

/**
 * Which scheme our own absolute URLs use. Everything is https unless the root
 * domain is obviously local — set NEXT_PUBLIC_ROOT_SCHEME to force it either way
 * (e.g. a staging box on plain http).
 */
function scheme(): "http" | "https" {
  const override = process.env.NEXT_PUBLIC_ROOT_SCHEME;
  if (override === "http" || override === "https") return override;
  return LOCAL_HOST.test(env.rootDomain.split(":")[0].toLowerCase()) ? "http" : "https";
}

/** Whether our own URLs are https — and therefore whether cookies get `Secure`. */
export function usesHttps(): boolean {
  return scheme() === "https";
}

/** Absolute URL for the marketing site (registration, login, OAuth callback). */
export function rootUrl(path = "/"): string {
  return `${scheme()}://${env.rootDomain}${path}`;
}

/** Absolute URL for one church's site. */
export function tenantUrl(slug: string, path = "/"): string {
  return `${scheme()}://${slug}.${env.rootDomain}${path}`;
}
