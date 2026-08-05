import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, userProfilesTable, userMapDataTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  validateUsername,
  isUsernameTaken,
  generateUniqueUsername,
} from "../lib/username";

const router: IRouter = Router();

// ─── GET /profile/me ──────────────────────────────────────────────────────────

router.get("/profile/me", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    let [profile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId));

    // Auto-provision profile if this is the user's first authenticated request
    if (!profile) {
      const [mapRow] = await db
        .select({ data: userMapDataTable.data })
        .from(userMapDataTable)
        .where(eq(userMapDataTable.userId, userId));

      const seed =
        (mapRow?.data as Record<string, unknown> | null)?.profileName as
          | string
          | undefined;

      const username = await generateUniqueUsername(seed ?? null);

      [profile] = await db
        .insert(userProfilesTable)
        .values({ userId, username, displayName: seed ?? null, usernameSet: false })
        .onConflictDoNothing()
        .returning();

      // If another request provisioned it first (race), just read it back
      if (!profile) {
        [profile] = await db
          .select()
          .from(userProfilesTable)
          .where(eq(userProfilesTable.userId, userId));
      }
    }

    res.json({
      userId: profile.userId,
      username: profile.username,
      displayName: profile.displayName ?? null,
      usernameSet: profile.usernameSet,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching profile");
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// ─── PUT /profile/username ────────────────────────────────────────────────────

router.put("/profile/username", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { username: rawUsername } = req.body as { username?: string };
  if (!rawUsername) {
    res.status(400).json({ error: "username is required" });
    return;
  }

  const validation = validateUsername(rawUsername);
  if (!validation.ok) {
    const statusCode = validation.error.code === "username_taken" ? 409 : 400;
    res.status(statusCode).json({ error: validation.error.message, code: validation.error.code });
    return;
  }

  const { username } = validation;

  try {
    // Check uniqueness (case-insensitive)
    const [existing] = await db
      .select({ userId: userProfilesTable.userId })
      .from(userProfilesTable)
      .where(eq(sql`lower(${userProfilesTable.username})`, username))
      .limit(1);

    if (existing && existing.userId !== userId) {
      res.status(409).json({
        error: "That username is already taken. Please choose another.",
        code: "username_taken",
      });
      return;
    }

    // Upsert profile (auto-provision if needed)
    const [updated] = await db
      .insert(userProfilesTable)
      .values({ userId, username, usernameSet: true })
      .onConflictDoUpdate({
        target: userProfilesTable.userId,
        set: { username, usernameSet: true },
      })
      .returning();

    res.json({
      ok: true,
      username: updated.username,
      usernameSet: updated.usernameSet,
    });
  } catch (err) {
    req.log.error({ err }, "Error setting username");
    res.status(500).json({ error: "Failed to set username" });
  }
});

export default router;
