import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { CreateMapShareBody } from "@workspace/api-zod";
import { db, mapSharesTable, type MapShareSnapshot } from "@workspace/db";
import { eq } from "drizzle-orm";

const apiRouter: IRouter = Router();
export const publicShareRouter: IRouter = Router();

const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const SHARE_CACHE_CONTROL = "public, max-age=31536000, immutable";

function shareId(): string {
  return randomBytes(24).toString("base64url");
}

function normalizeItems(items: string[] | undefined): string[] {
  return Array.from(new Set(items ?? []));
}

function normalizeSnapshot(snapshot: MapShareSnapshot): MapShareSnapshot {
  const notes = snapshot.n
    ? Object.fromEntries(
        Object.entries(snapshot.n)
          .filter(([key]) => key.length <= 160)
          .map(([key, value]) => [key, value.trim()]),
      )
    : undefined;

  return {
    vc: normalizeItems(snapshot.vc),
    vs: normalizeItems(snapshot.vs),
    vp: normalizeItems(snapshot.vp),
    bc: normalizeItems(snapshot.bc),
    bs: normalizeItems(snapshot.bs),
    bp: normalizeItems(snapshot.bp),
    ...(snapshot.tv && { tv: normalizeItems(snapshot.tv) }),
    ...(snapshot.tb && { tb: normalizeItems(snapshot.tb) }),
    ...(notes && Object.keys(notes).length > 0 && { n: notes }),
  };
}

function shareCounts(snapshot: MapShareSnapshot): { visitedCount: number; bucketCount: number } {
  const countCategories = (...categories: Array<string[] | undefined>): number =>
    categories.reduce((total, category) => total + new Set(category ?? []).size, 0);

  return {
    visitedCount: countCategories(snapshot.vc, snapshot.vs, snapshot.vp, snapshot.tv),
    bucketCount: countCategories(snapshot.bc, snapshot.bs, snapshot.bp, snapshot.tb),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function requestOrigin(req: Request): string {
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto === "https" ? "https" : req.protocol;
  const host = req.get("host");
  return `${protocol}://${host}`;
}

function shareDescription(visitedCount: number, bucketCount: number): string {
  return `A public travel-map snapshot with ${visitedCount} visited ${visitedCount === 1 ? "place" : "places"} and ${bucketCount} bucket-list ${bucketCount === 1 ? "place" : "places"}.`;
}

function renderShareHtml(
  canonicalUrl: string,
  stablePath: string,
  imageUrl: string,
  visitedCount: number,
  bucketCount: number,
): string {
  const title = `Travel map — ${visitedCount} places visited`;
  const description = shareDescription(visitedCount, bucketCount);
  const handoffPath = `/?shareId=${encodeURIComponent(stablePath.slice(3))}`;
  const escapedTitle = escapeHtml(title);
  const escapedDescription = escapeHtml(description);
  const escapedCanonical = escapeHtml(canonicalUrl);
  const escapedImage = escapeHtml(imageUrl);
  const escapedHandoff = escapeHtml(handoffPath);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapedTitle}</title>
    <meta name="description" content="${escapedDescription}">
    <meta name="robots" content="noindex, nofollow">
    <link rel="canonical" href="${escapedCanonical}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapedTitle}">
    <meta property="og:description" content="${escapedDescription}">
    <meta property="og:url" content="${escapedCanonical}">
    <meta property="og:image" content="${escapedImage}">
    <meta property="og:image:type" content="image/svg+xml">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Travel map preview showing ${visitedCount} visited places">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapedTitle}">
    <meta name="twitter:description" content="${escapedDescription}">
    <meta name="twitter:image" content="${escapedImage}">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":${JSON.stringify(title)},"description":${JSON.stringify(description)},"url":${JSON.stringify(canonicalUrl)},"isPartOf":{"@type":"WebSite","name":"World Map Travel Tracker"}}</script>
  </head>
  <body>
    <main>
      <h1>${escapedTitle}</h1>
      <p>${escapedDescription}</p>
      <p>This is a read-only public snapshot. Opening the interactive map…</p>
      <p><a href="${escapedHandoff}">Open the shared travel map</a></p>
    </main>
    <script>try { sessionStorage.setItem("wm_share_stable_path", ${JSON.stringify(stablePath)}); } catch (_) {} location.replace(${JSON.stringify(handoffPath)});</script>
  </body>
</html>`;
}

function dotPositions(seed: string, count: number): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return Array.from({ length: Math.min(count, 64) }, (_, index) => {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    const x = 120 + (hash % 960);
    hash = (hash * 1664525 + 1013904223) >>> 0;
    const y = 172 + (hash % 260);
    return `<circle cx="${x}" cy="${y}" r="5" fill="#38bdf8" opacity=".9"/>`;
  }).join("");
}

function renderSharePreview(id: string, visitedCount: number, bucketCount: number): string {
  const pluralVisited = visitedCount === 1 ? "PLACE VISITED" : "PLACES VISITED";
  const pluralBucket = bucketCount === 1 ? "BUCKET-LIST PLACE" : "BUCKET-LIST PLACES";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc">
  <title id="title">Travel map preview</title>
  <desc id="desc">${visitedCount} visited places and ${bucketCount} bucket-list places</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#172554"/></linearGradient>
    <pattern id="grid" width="80" height="54" patternUnits="userSpaceOnUse"><path d="M80 0H0V54" fill="none" stroke="#60a5fa" stroke-opacity=".12"/></pattern>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/><rect width="1200" height="630" fill="url(#grid)"/>
  <g fill="#334155" stroke="#64748b" stroke-opacity=".6" stroke-width="2">
    <path d="M125 215l65-63 93 15 43 52-27 83-71 23-35 68-52-31 13-69-44-37z"/>
    <path d="M351 150l90-20 58 37-24 57 55 37-17 95-81 19-66-52 13-71-36-41z"/>
    <path d="M599 165l121-28 79 28 35 69-50 50-24 84-89 7-65-70 20-59-27-41z"/>
    <path d="M860 185l98-26 100 48-12 76-61 30-74-31-63-39z"/>
    <path d="M716 396l74-13 54 44-15 105-62 49-46-64 14-68z"/>
    <path d="M275 411l57 14 32 69-35 81-46-14-27-73z"/>
  </g>
  <g>${dotPositions(id, visitedCount)}</g>
  <g font-family="Arial, Helvetica, sans-serif">
    <text x="70" y="72" fill="#bfdbfe" font-size="24" font-weight="700" letter-spacing="4">WORLD MAP TRAVEL TRACKER</text>
    <text x="70" y="562" fill="#f8fafc" font-size="66" font-weight="800">${visitedCount}</text>
    <text x="70" y="596" fill="#7dd3fc" font-size="20" font-weight="700" letter-spacing="2">${pluralVisited}</text>
    <text x="965" y="562" fill="#f8fafc" font-size="50" font-weight="800">${bucketCount}</text>
    <text x="965" y="596" fill="#fcd34d" font-size="16" font-weight="700" text-anchor="end" letter-spacing="1">${pluralBucket}</text>
  </g>
</svg>`;
}

function getShareId(req: Request): string | null {
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  return typeof id === "string" && SHARE_ID_PATTERN.test(id) ? id : null;
}

apiRouter.post("/shares", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateMapShareBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid share snapshot" });
    return;
  }

  const noteKeys = Object.keys(parsed.data.snapshot.n ?? {});
  if (noteKeys.length > 500 || noteKeys.some((key) => key.length === 0 || key.length > 160)) {
    res.status(400).json({ error: "Invalid share snapshot" });
    return;
  }

  const snapshot = normalizeSnapshot(parsed.data.snapshot as MapShareSnapshot);
  const { visitedCount, bucketCount } = shareCounts(snapshot);
  const ownerUserId = getAuth(req).userId ?? null;

  try {
    let id = shareId();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await db
        .select({ id: mapSharesTable.id })
        .from(mapSharesTable)
        .where(eq(mapSharesTable.id, id))
        .limit(1);
      if (existing.length === 0) break;
      id = shareId();
    }

    await db.insert(mapSharesTable).values({
      id,
      ownerUserId,
      snapshot,
      visitedCount,
      bucketCount,
    });
    res.status(201).json({ id, sharePath: `/s/${id}` });
  } catch (err) {
    req.log.error({ err }, "Error creating map share");
    res.status(500).json({ error: "Unable to create share link" });
  }
});

apiRouter.get("/shares/:id", async (req: Request, res: Response): Promise<void> => {
  const id = getShareId(req);
  if (!id) {
    res.status(404).json({ error: "Shared map not found" });
    return;
  }

  try {
    const [share] = await db
      .select({
        snapshot: mapSharesTable.snapshot,
      })
      .from(mapSharesTable)
      .where(eq(mapSharesTable.id, id))
      .limit(1);
    if (!share) {
      res.status(404).json({ error: "Shared map not found" });
      return;
    }

    res.set("Cache-Control", SHARE_CACHE_CONTROL).json({
      snapshot: share.snapshot,
      ...shareCounts(share.snapshot),
    });
  } catch (err) {
    req.log.error({ err }, "Error loading shared map");
    res.status(500).json({ error: "Unable to open shared map" });
  }
});

publicShareRouter.get("/s/:id", async (req: Request, res: Response): Promise<void> => {
  const id = getShareId(req);
  if (!id) {
    res.status(404).send("Shared map not found");
    return;
  }

  try {
    const [share] = await db
      .select()
      .from(mapSharesTable)
      .where(eq(mapSharesTable.id, id))
      .limit(1);
    if (!share) {
      res.status(404).send("Shared map not found");
      return;
    }

    const origin = requestOrigin(req);
    const shareUrl = `${origin}/s/${id}`;
    res
      .status(200)
      .set("Cache-Control", SHARE_CACHE_CONTROL)
      .set("X-Robots-Tag", "noindex, nofollow")
      .type("html")
      .send(renderShareHtml(
        shareUrl,
        `/s/${id}`,
        `${shareUrl}/preview.svg`,
        shareCounts(share.snapshot).visitedCount,
        shareCounts(share.snapshot).bucketCount,
      ));
  } catch (err) {
    req.log.error({ err }, "Error serving shared map");
    res.status(500).send("Unable to open shared map");
  }
});

publicShareRouter.get("/s/:id/preview.svg", async (req: Request, res: Response): Promise<void> => {
  const id = getShareId(req);
  if (!id) {
    res.status(404).send("Preview not found");
    return;
  }

  try {
    const [share] = await db
      .select({
        snapshot: mapSharesTable.snapshot,
      })
      .from(mapSharesTable)
      .where(eq(mapSharesTable.id, id))
      .limit(1);
    if (!share) {
      res.status(404).send("Preview not found");
      return;
    }

    res
      .status(200)
      .set("Cache-Control", SHARE_CACHE_CONTROL)
      .set("X-Robots-Tag", "noindex, nofollow")
      .type("image/svg+xml")
      .send(renderSharePreview(id, shareCounts(share.snapshot).visitedCount, shareCounts(share.snapshot).bucketCount));
  } catch (err) {
    req.log.error({ err }, "Error serving shared map preview");
    res.status(500).send("Unable to load preview");
  }
});

export default apiRouter;