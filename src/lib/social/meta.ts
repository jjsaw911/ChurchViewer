import { getSetting } from "@/lib/settings";

/**
 * Talking to Facebook and Instagram.
 *
 * Both are the same API — Instagram Business profiles hang off a Facebook Page,
 * and everything goes through Meta's Graph. So this is one file with two ways
 * out of it, rather than two integrations that happen to look alike.
 *
 * Two things about this that are not our design and cannot be worked around:
 *
 * Instagram will not accept an upload. It is given a URL and fetches the
 * picture itself, which means the image has to be reachable from Meta's servers
 * for the minute or so the post takes. Our signed bucket URLs are, for their
 * lifetime, which is why posting resolves one at the moment of posting rather
 * than storing one.
 *
 * And a church can only post to a page it administers, through an app Meta has
 * reviewed. Until that review, an app in development mode can post to pages
 * owned by its own developers and testers — which is enough for the church that
 * set this up, and not enough for anybody else. The connect screen says so
 * rather than letting somebody find out on a Sunday.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export const META_APP_ID = "meta_app_id";
export const META_APP_SECRET = "meta_app_secret";

export type MetaApp = { appId: string; appSecret: string };

/** The credentials for the Meta app, set once by whoever runs the platform. */
export async function metaApp(): Promise<MetaApp | null> {
  const [appId, appSecret] = await Promise.all([
    getSetting(META_APP_ID),
    getSetting(META_APP_SECRET),
  ]);

  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

export const isMetaConfigured = async () => Boolean(await metaApp());

/**
 * Where somebody is sent to say yes.
 *
 * The scopes are the least that will do the job: read which pages they manage,
 * post to those pages, and post to the Instagram profile attached to one. No
 * reading of messages, no insights, nothing about the people who follow them.
 */
export function authorizeUrl(app: MetaApp, redirectUri: string, state: string): string {
  const scopes = [
    "pages_show_list",
    "pages_manage_posts",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_content_publish",
    "business_management",
  ];

  const query = new URLSearchParams({
    client_id: app.appId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: scopes.join(","),
  });

  return `https://www.facebook.com/v21.0/dialog/oauth?${query}`;
}

type Fetched = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

async function graph(path: string, init?: RequestInit): Promise<Fetched> {
  try {
    const response = await fetch(`${GRAPH}${path}`, { ...init, cache: "no-store" });
    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      // Meta's errors are the useful part of Meta's API. Passed through rather
      // than flattened to "something went wrong", because they say exactly
      // which permission is missing.
      const error = data.error as { message?: string } | undefined;
      return { ok: false, error: error?.message ?? `Facebook said no (${response.status}).` };
    }

    return { ok: true, data };
  } catch {
    return { ok: false, error: "Couldn't reach Facebook." };
  }
}

/** The code from the redirect, exchanged for a token that lasts two months. */
export async function exchangeCode(
  app: MetaApp,
  code: string,
  redirectUri: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const short = await graph(
    `/oauth/access_token?${new URLSearchParams({
      client_id: app.appId,
      client_secret: app.appSecret,
      redirect_uri: redirectUri,
      code,
    })}`,
  );
  if (!short.ok) return short;

  const token = String(short.data.access_token ?? "");
  if (!token) return { ok: false, error: "Facebook returned no token." };

  // Short-lived tokens last an hour, which is no use to a church that posts on
  // Sundays. The long-lived one is what page tokens are then derived from, and
  // those do not expire on a timetable at all.
  const long = await graph(
    `/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: app.appId,
      client_secret: app.appSecret,
      fb_exchange_token: token,
    })}`,
  );
  if (!long.ok) return long;

  return { ok: true, token: String(long.data.access_token ?? token) };
}

export type Destination = {
  platform: "facebook" | "instagram";
  externalId: string;
  name: string;
  accessToken: string;
};

/**
 * Every page this person manages, and any Instagram profile attached to one.
 *
 * Both are offered because a church almost always has both and thinks of them
 * as one thing — "our socials" — even though Meta does not.
 */
export async function listDestinations(
  userToken: string,
): Promise<{ ok: true; destinations: Destination[] } | { ok: false; error: string }> {
  const pages = await graph(
    `/me/accounts?${new URLSearchParams({
      fields: "id,name,access_token,instagram_business_account{id,username}",
      limit: "100",
      access_token: userToken,
    })}`,
  );
  if (!pages.ok) return pages;

  const rows = (pages.data.data ?? []) as {
    id: string;
    name: string;
    access_token: string;
    instagram_business_account?: { id: string; username?: string };
  }[];

  const destinations: Destination[] = [];

  for (const page of rows) {
    destinations.push({
      platform: "facebook",
      externalId: page.id,
      name: page.name,
      accessToken: page.access_token,
    });

    if (page.instagram_business_account) {
      destinations.push({
        platform: "instagram",
        externalId: page.instagram_business_account.id,
        // The page's token is what posts to its Instagram profile too.
        name: page.instagram_business_account.username
          ? `@${page.instagram_business_account.username}`
          : `${page.name} on Instagram`,
        accessToken: page.access_token,
      });
    }
  }

  return { ok: true, destinations };
}

export type PostResult = { ok: true; externalId: string } | { ok: false; error: string };

/** A post on a Facebook Page: words, and a picture or a link if there is one. */
export async function postToPage(
  pageId: string,
  token: string,
  post: { message: string; imageUrl?: string | null; linkUrl?: string | null },
): Promise<PostResult> {
  const body = new URLSearchParams({ access_token: token });

  if (post.imageUrl) {
    // A photo post, with the words as its caption — which is what a church
    // means by "put this picture up", rather than a link with a thumbnail.
    body.set("caption", post.message);
    body.set("url", post.imageUrl);

    const result = await graph(`/${pageId}/photos`, { method: "POST", body });
    if (!result.ok) return result;
    return { ok: true, externalId: String(result.data.post_id ?? result.data.id ?? "") };
  }

  body.set("message", post.message);
  if (post.linkUrl) body.set("link", post.linkUrl);

  const result = await graph(`/${pageId}/feed`, { method: "POST", body });
  if (!result.ok) return result;
  return { ok: true, externalId: String(result.data.id ?? "") };
}

/**
 * Instagram, in two steps, because Instagram will not take an upload.
 *
 * A container is created from a URL it fetches itself, and then published. A
 * post without a picture is not possible there at all — which is a rule of the
 * platform, and the composer says so rather than failing here.
 */
export async function postToInstagram(
  profileId: string,
  token: string,
  post: { message: string; imageUrl?: string | null },
): Promise<PostResult> {
  if (!post.imageUrl) {
    return { ok: false, error: "Instagram posts need a picture. Facebook doesn't." };
  }

  const container = await graph(`/${profileId}/media`, {
    method: "POST",
    body: new URLSearchParams({
      image_url: post.imageUrl,
      caption: post.message,
      access_token: token,
    }),
  });
  if (!container.ok) return container;

  const creationId = String(container.data.id ?? "");
  if (!creationId) return { ok: false, error: "Instagram accepted nothing to publish." };

  const published = await graph(`/${profileId}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({ creation_id: creationId, access_token: token }),
  });
  if (!published.ok) return published;

  return { ok: true, externalId: String(published.data.id ?? creationId) };
}
