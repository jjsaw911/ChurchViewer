import { createHash, randomBytes } from "node:crypto";
import { env, rootUrl } from "@/lib/env";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const OAUTH_STATE_COOKIE = "cv_oauth_state";
export const OAUTH_VERIFIER_COOKIE = "cv_oauth_verifier";
export const OAUTH_NEXT_COOKIE = "cv_oauth_next";

export const redirectUri = () => rootUrl("/api/auth/google/callback");

export function createPkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, state: randomBytes(16).toString("base64url") };
}

export function authorizationUrl(challenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

/**
 * Exchange the authorization code for an ID token and read the identity out of
 * it. We don't verify the JWT signature, and don't need to: the token came
 * straight back from Google's token endpoint over TLS, authenticated with our
 * client secret (OIDC Core §3.1.3.7 explicitly allows skipping it here).
 */
export async function exchangeCode(code: string, verifier: string): Promise<GoogleIdentity> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed (${response.status})`);
  }

  const { id_token: idToken } = (await response.json()) as { id_token?: string };
  if (!idToken) throw new Error("Google response contained no id_token");

  return readIdentity(idToken);
}

/** Exported for testing — the claim checks are the security-relevant part. */
export function readIdentity(idToken: string): GoogleIdentity {
  const payload = idToken.split(".")[1];
  if (!payload) throw new Error("Malformed id_token");

  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    iss?: string;
    aud?: string;
    exp?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  const issuers = ["https://accounts.google.com", "accounts.google.com"];
  if (!claims.iss || !issuers.includes(claims.iss)) throw new Error("Unexpected id_token issuer");
  if (claims.aud !== env.google.clientId) throw new Error("id_token was issued for another client");
  if (!claims.exp || claims.exp * 1000 <= Date.now()) throw new Error("id_token has expired");
  if (!claims.sub || !claims.email) throw new Error("id_token is missing sub or email");

  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    emailVerified: claims.email_verified === true,
    name: claims.name?.trim() || claims.email.split("@")[0],
  };
}
