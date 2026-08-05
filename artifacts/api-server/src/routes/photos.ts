import { randomUUID } from "crypto";
import { Readable } from "stream";
import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { getAuth } from "@clerk/express";
import { db, userPhotosTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ObjectStorageService,
  ObjectNotFoundError,
  objectStorageClient,
} from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

const MAX_PHOTOS = 3;
const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, and WebP are supported"));
  },
});

/** Upload a buffer directly to GCS and return the normalized storage key. */
async function uploadBufferToGcs(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const objectId = randomUUID();
  const storageKey = `/objects/uploads/${objectId}`;

  // Derive GCS coordinates using the same logic as getObjectEntityFile.
  let privateDir = objectStorage.getPrivateObjectDir();
  if (!privateDir.endsWith("/")) privateDir += "/";
  const fullPath = `${privateDir}uploads/${objectId}`;
  const normalized = fullPath.startsWith("/") ? fullPath.slice(1) : fullPath;
  const parts = normalized.split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  await new Promise<void>((resolve, reject) => {
    const stream = file.createWriteStream({
      metadata: { contentType: mimeType },
      resumable: false,
    });
    stream.on("error", reject);
    stream.on("finish", resolve);
    stream.end(buffer);
  });

  return storageKey;
}

function photoResponse(row: {
  id: string;
  caption: string;
  position: number;
  createdAt: Date;
}) {
  return {
    id: row.id,
    url: `/api/photos/${row.id}/content`,
    caption: row.caption,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── GET /photos?category=X&destinationId=Y ───────────────────────────────────

router.get("/photos", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { category, destinationId } = req.query as {
    category?: string;
    destinationId?: string;
  };
  if (!category || !destinationId) {
    res.status(400).json({ error: "category and destinationId are required" });
    return;
  }

  try {
    const rows = await db
      .select()
      .from(userPhotosTable)
      .where(
        and(
          eq(userPhotosTable.userId, userId),
          eq(userPhotosTable.category, category),
          eq(userPhotosTable.destinationId, destinationId),
        ),
      )
      .orderBy(userPhotosTable.position);

    res.json({ photos: rows.map(photoResponse) });
  } catch (err) {
    req.log.error({ err }, "Error listing photos");
    res.status(500).json({ error: "Failed to list photos" });
  }
});

// ─── POST /photos (multipart/form-data) ───────────────────────────────────────

router.post(
  "/photos",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const { category, destinationId, position, caption } = req.body as {
      category?: string;
      destinationId?: string;
      position?: string;
      caption?: string;
    };

    if (!category || !destinationId) {
      res.status(400).json({ error: "category and destinationId are required" });
      return;
    }

    const pos = Math.max(0, Math.min(2, parseInt(position ?? "0", 10) || 0));

    try {
      // Enforce 3-photo limit
      const existing = await db
        .select()
        .from(userPhotosTable)
        .where(
          and(
            eq(userPhotosTable.userId, userId),
            eq(userPhotosTable.category, category),
            eq(userPhotosTable.destinationId, destinationId),
          ),
        );

      if (existing.length >= MAX_PHOTOS) {
        res.status(400).json({ error: "Maximum 3 photos per destination" });
        return;
      }

      const storageKey = await uploadBufferToGcs(
        req.file.buffer,
        req.file.mimetype,
      );

      const [row] = await db
        .insert(userPhotosTable)
        .values({
          userId,
          category,
          destinationId,
          storageKey,
          caption: (caption ?? "").slice(0, 120),
          position: pos,
        })
        .returning();

      res.json(photoResponse(row));
    } catch (err) {
      req.log.error({ err }, "Error uploading photo");
      res.status(500).json({ error: "Failed to upload photo" });
    }
  },
);

// ─── PATCH /photos/:id ────────────────────────────────────────────────────────

router.patch("/photos/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = String(req.params.id);
  const { caption } = req.body as { caption?: string };

  try {
    const [existing] = await db
      .select()
      .from(userPhotosTable)
      .where(and(eq(userPhotosTable.id, id), eq(userPhotosTable.userId, userId)));

    if (!existing) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }

    const [updated] = await db
      .update(userPhotosTable)
      .set({ caption: (caption ?? "").slice(0, 120) })
      .where(eq(userPhotosTable.id, id))
      .returning();

    res.json(photoResponse(updated));
  } catch (err) {
    req.log.error({ err }, "Error updating photo");
    res.status(500).json({ error: "Failed to update photo" });
  }
});

// ─── DELETE /photos/:id ───────────────────────────────────────────────────────

router.delete("/photos/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = String(req.params.id);

  try {
    const [existing] = await db
      .select()
      .from(userPhotosTable)
      .where(and(eq(userPhotosTable.id, id), eq(userPhotosTable.userId, userId)));

    if (!existing) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }

    // Delete from GCS (best-effort — don't block DB delete on GCS errors)
    try {
      const objectFile = await objectStorage.getObjectEntityFile(
        existing.storageKey,
      );
      await objectFile.delete();
    } catch (gcsErr) {
      if (!(gcsErr instanceof ObjectNotFoundError)) {
        req.log.warn({ err: gcsErr }, "GCS delete failed; proceeding with DB delete");
      }
    }

    await db.delete(userPhotosTable).where(eq(userPhotosTable.id, id));

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting photo");
    res.status(500).json({ error: "Failed to delete photo" });
  }
});

// ─── GET /photos/:id/content ──────────────────────────────────────────────────

router.get("/photos/:id/content", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = String(req.params.id);

  try {
    const [row] = await db
      .select()
      .from(userPhotosTable)
      .where(and(eq(userPhotosTable.id, id), eq(userPhotosTable.userId, userId)));

    if (!row) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }

    const objectFile = await objectStorage.getObjectEntityFile(row.storageKey);
    const response = await objectStorage.downloadObject(objectFile, 3600);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }
    req.log.error({ err }, "Error serving photo");
    res.status(500).json({ error: "Failed to serve photo" });
  }
});

export default router;
