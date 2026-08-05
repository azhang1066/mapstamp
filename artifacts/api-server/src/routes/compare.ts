import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, userDestinationsTable, userProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAcceptedConnection, ForbiddenError } from "../lib/requireConnection";

const router: IRouter = Router();

// ─── GET /compare/:otherUserId ────────────────────────────────────────────────

router.get("/compare/:otherUserId", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const otherUserId = String(req.params.otherUserId);
  if (otherUserId === userId) {
    res.status(400).json({ error: "Cannot compare with yourself" });
    return;
  }

  try {
    await requireAcceptedConnection(userId, otherUserId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      res.status(403).json({ error: "No accepted connection with this user" });
      return;
    }
    throw err;
  }

  try {
    // Fetch both users' destinations and profiles in parallel
    const [myDests, otherDests, myProfile, otherProfile] = await Promise.all([
      db
        .select()
        .from(userDestinationsTable)
        .where(eq(userDestinationsTable.userId, userId)),
      db
        .select()
        .from(userDestinationsTable)
        .where(eq(userDestinationsTable.userId, otherUserId)),
      db
        .select({
          username: userProfilesTable.username,
          displayName: userProfilesTable.displayName,
        })
        .from(userProfilesTable)
        .where(eq(userProfilesTable.userId, userId))
        .limit(1)
        .then((r) => r[0] ?? null),
      db
        .select({
          username: userProfilesTable.username,
          displayName: userProfilesTable.displayName,
        })
        .from(userProfilesTable)
        .where(eq(userProfilesTable.userId, otherUserId))
        .limit(1)
        .then((r) => r[0] ?? null),
    ]);

    res.json({
      me: {
        userId,
        username: myProfile?.username ?? null,
        displayName: myProfile?.displayName ?? null,
        destinations: myDests,
      },
      other: {
        userId: otherUserId,
        username: otherProfile?.username ?? null,
        displayName: otherProfile?.displayName ?? null,
        destinations: otherDests,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching comparison data");
    res.status(500).json({ error: "Failed to fetch comparison data" });
  }
});

export default router;
