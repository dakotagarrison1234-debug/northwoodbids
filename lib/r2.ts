import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";

/**
 * Shared Cloudflare R2 (S3-compatible) client + object cleanup.
 *
 * Item photos are stored as full public URLs (ItemPhoto.url =
 * `${CLOUDFLARE_R2_PUBLIC_URL}/items/…`). When a photo row is removed — an item is
 * deleted, or its photo set is edited — the DB row goes but the R2 object stays,
 * billed forever. This turns those dropped URLs back into keys and deletes them.
 *
 * Best-effort by design: storage cleanup must NEVER fail a user's delete/edit, so
 * every entry point swallows errors and just logs them.
 */

let _s3: S3Client | null = null;
function s3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: "auto",
      endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _s3;
}

/**
 * Map a stored public URL back to its bucket key, or null if the URL isn't one of
 * ours (e.g. an externally-hosted image we should never try to delete).
 */
export function keyFromPublicUrl(url: string): string | null {
  const base = process.env.CLOUDFLARE_R2_PUBLIC_URL;
  if (!base || typeof url !== "string") return null;
  const prefix = base.endsWith("/") ? base : base + "/";
  if (!url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length).split("?")[0];
  return key || null;
}

/**
 * Delete R2 objects for the given stored photo URLs. Only URLs under our own public
 * base are touched; anything else is ignored. Never throws.
 */
export async function deleteR2ObjectsByUrl(urls: string[]): Promise<void> {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;
  if (!bucket) return;
  const keys = [...new Set(urls.map(keyFromPublicUrl).filter((k): k is string => !!k))];
  if (keys.length === 0) return;

  try {
    // DeleteObjects handles up to 1000 keys per call; chunk to be safe.
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      await s3().send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        })
      );
    }
  } catch (e) {
    // Best-effort: a failed cleanup just leaves an orphan, never breaks the caller.
    console.error("R2 cleanup failed:", e);
  }
}

/**
 * One-shot sweep of orphaned ITEM photos in R2: objects under the `items/` prefix
 * that no ItemPhoto row references and are older than `minAgeHours`.
 *
 * Deliberately conservative so it can never destroy live data:
 *  - Scoped to the `items/` prefix ONLY — org logos, bidder avatars, and anything
 *    stored under another prefix are never even listed.
 *  - Skips objects younger than the age cutoff (default 24h) so an image uploaded
 *    seconds before its ItemPhoto row is written is never mistaken for an orphan.
 *
 * Returns how many objects were scanned and deleted. Meant to be run occasionally
 * from an admin action, not on a hot path.
 */
export async function sweepOrphanItemObjects(
  minAgeHours = 24
): Promise<{ scanned: number; deleted: number }> {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;
  if (!bucket) return { scanned: 0, deleted: 0 };

  // Every key still referenced by a photo row (only `items/` keys can match here).
  const rows = await prisma.itemPhoto.findMany({ select: { url: true } });
  const referenced = new Set(rows.map((r) => keyFromPublicUrl(r.url)).filter((k): k is string => !!k));

  const cutoff = Date.now() - minAgeHours * 60 * 60 * 1000;
  let scanned = 0;
  const toDelete: string[] = [];
  let ContinuationToken: string | undefined;

  try {
    do {
      const res = await s3().send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: "items/", ContinuationToken })
      );
      for (const obj of res.Contents ?? []) {
        if (!obj.Key) continue;
        scanned++;
        const aged = obj.LastModified ? obj.LastModified.getTime() < cutoff : false;
        if (aged && !referenced.has(obj.Key)) toDelete.push(obj.Key);
      }
      ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (ContinuationToken);

    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += 1000) {
      const chunk = toDelete.slice(i, i + 1000);
      await s3().send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        })
      );
      deleted += chunk.length;
    }
    return { scanned, deleted };
  } catch (e) {
    console.error("R2 orphan sweep failed:", e);
    return { scanned, deleted: 0 };
  }
}
