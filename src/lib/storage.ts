import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { env } from "@/lib/env";

/**
 * Media locations are stored as one of:
 *   `gcs:<object-key>`      an object in our own bucket
 *   `https://…`             anything the church already hosts elsewhere
 *
 * Keeping both in a single column means a church can start by pasting links and
 * move to uploads later without a schema change.
 */
const GCS_PREFIX = "gcs:";

const READ_URL_TTL_MS = 6 * 60 * 60 * 1000;
const UPLOAD_URL_TTL_MS = 30 * 60 * 1000;

let client: Storage | null = null;
const storage = () => (client ??= new Storage());

export const isGcsLocation = (location: string) => location.startsWith(GCS_PREFIX);
export const objectKey = (location: string) => location.slice(GCS_PREFIX.length);
export const gcsLocation = (key: string) => `${GCS_PREFIX}${key}`;

/** Where uploads for one church live. Random suffix keeps names unguessable. */
export function buildObjectKey(churchSlug: string, filename: string): string {
  const safe = filename
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-80);
  return `churches/${churchSlug}/${randomUUID()}-${safe || "upload"}`;
}

/**
 * A URL the browser can play. GCS objects stay private and are handed out as
 * short-lived signed URLs; signed URLs support range requests, so seeking and
 * resuming still work.
 */
export async function playbackUrl(location: string | null): Promise<string | null> {
  if (!location) return null;
  if (!isGcsLocation(location)) return location;
  if (!env.storage.isConfigured) return null;

  const [url] = await storage()
    .bucket(env.storage.bucket)
    .file(objectKey(location))
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + READ_URL_TTL_MS,
    });
  return url;
}

/** A PUT target the browser uploads to directly — bytes never touch the VM. */
export async function createUploadUrl(input: {
  churchSlug: string;
  filename: string;
  contentType: string;
}): Promise<{ uploadUrl: string; location: string }> {
  const key = buildObjectKey(input.churchSlug, input.filename);

  const [uploadUrl] = await storage()
    .bucket(env.storage.bucket)
    .file(key)
    .getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + UPLOAD_URL_TTL_MS,
      contentType: input.contentType,
    });

  return { uploadUrl, location: gcsLocation(key) };
}

export async function deleteObject(location: string): Promise<void> {
  if (!isGcsLocation(location) || !env.storage.isConfigured) return;
  await storage()
    .bucket(env.storage.bucket)
    .file(objectKey(location))
    .delete({ ignoreNotFound: true });
}
