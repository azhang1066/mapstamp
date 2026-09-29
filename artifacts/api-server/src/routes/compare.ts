import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, userDestinationsTable, userProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CompareWithUserParams, CompareWithUserResponse } from "@workspace/api-zod";
import { requireAcceptedConnection, ForbiddenError } from "../lib/requireConnection";

const router: IRouter = Router();

// ─── GET /compare/:otherUserId ────────────────────────────────────────────────

router.get("/compare/:otherUserId", async (req: Request, res: Response): Promise<void> => {
  res.set("Cache-Control", "no-store");
  let userId: string | null | undefined;
  try {
    userId = getAuth(req).userId;
  } catch (err) {
    req.log.warn({ err }, "Could not resolve comparison authentication");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const params = CompareWithUserParams.safeParse(req.params);
  if (!params.success || !params.data.otherUserId.trim()) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  const { otherUserId } = params.data;
  if (otherUserId === userId) {
    res.status(400).json({ error: "Cannot compare with yourself" });
    return;
  }

  try {
    await requireAcceptedConnection(userId, otherUserId);
    // Only normalized destination columns are read. Neither JSONB nor photo data
    // participates in this query or the explicit response serialization below.
    const destinationColumns = {
      userId: userDestinationsTable.userId,
      category: userDestinationsTable.category,
      destinationId: userDestinationsTable.destinationId,
      isVisited: userDestinationsTable.isVisited,
      isBucket: userDestinationsTable.isBucket,
      firstVisitedYear: userDestinationsTable.firstVisitedYear,
      lastVisitedYear: userDestinationsTable.lastVisitedYear,
      timesVisited: userDestinationsTable.timesVisited,
    };
    const [myDests, otherDests, myProfile, otherProfile] = await Promise.all([
      db
        .select(destinationColumns)
        .from(userDestinationsTable)
        .where(eq(userDestinationsTable.userId, userId)),
      db
        .select(destinationColumns)
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

    const serializeDestinations = (rows: typeof myDests) => rows.map((row) => ({
      userId: row.userId,
      category: row.category,
      destinationId: row.destinationId,
      isVisited: row.isVisited,
      isBucket: row.isBucket,
      firstVisitedYear: row.firstVisitedYear,
      lastVisitedYear: row.lastVisitedYear,
      timesVisited: row.timesVisited,
    }));

    res.json(CompareWithUserResponse.parse({
      me: {
        userId,
        username: myProfile?.username ?? null,
        displayName: myProfile?.displayName ?? null,
        destinations: serializeDestinations(myDests),
      },
      other: {
        userId: otherUserId,
        username: otherProfile?.username ?? null,
        displayName: otherProfile?.displayName ?? null,
        destinations: serializeDestinations(otherDests),
      },
    }));
  } catch (err) {
    if (err instanceof ForbiddenError) {
      res.status(403).json({ error: "No accepted connection with this user" });
      return;
    }
    req.log.error({ err }, "Error fetching comparison data");
    res.status(500).json({ error: "Failed to fetch comparison data" });
  }
});

export default router;
