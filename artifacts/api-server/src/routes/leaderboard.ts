import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, userConnectionsTable, userDestinationsTable, userProfilesTable } from "@workspace/db";
import { and, eq, inArray, or } from "drizzle-orm";

const router: IRouter = Router();

const NORM_CATEGORIES = ["country", "us_state", "ca_province", "tcc"] as const;

// ─── GET /leaderboard ─────────────────────────────────────────────────────────

router.get("/leaderboard", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // 1. Get all accepted connections for this user (either direction)
    const connectionRows = await db
      .select()
      .from(userConnectionsTable)
      .where(
        and(
          eq(userConnectionsTable.status, "accepted"),
          or(
            eq(userConnectionsTable.requesterId, userId),
            eq(userConnectionsTable.addresseeId, userId),
          ),
        ),
      );

    // Include the caller themselves in the leaderboard
    const peerIds = [
      userId,
      ...connectionRows.map((r) =>
        r.requesterId === userId ? r.addresseeId : r.requesterId,
      ),
    ];

    // 2. Fetch all destination rows for all peers in one query
    const destRows = await db
      .select()
      .from(userDestinationsTable)
      .where(inArray(userDestinationsTable.userId, peerIds));

    // 3. Fetch profiles for all peers
    const profileRows = await db
      .select({
        userId: userProfilesTable.userId,
        username: userProfilesTable.username,
        displayName: userProfilesTable.displayName,
      })
      .from(userProfilesTable)
      .where(inArray(userProfilesTable.userId, peerIds));

    const profileByUser = new Map(profileRows.map((p) => [p.userId, p]));

    // 4. Aggregate visited counts per user per category
    type Counts = Record<string, number>;
    const userCounts = new Map<string, Counts>();
    for (const id of peerIds) userCounts.set(id, {});

    for (const row of destRows) {
      if (!row.isVisited) continue;
      const counts = userCounts.get(row.userId);
      if (!counts) continue;
      counts[row.category] = (counts[row.category] ?? 0) + 1;
    }

    // 5. Build leaderboard entries
    const entries = peerIds.map((id) => {
      const counts = userCounts.get(id) ?? {};
      const profile = profileByUser.get(id);
      const totalVisited = Object.values(counts).reduce((a, b) => a + b, 0);

      return {
        userId: id,
        username: profile?.username ?? null,
        displayName: profile?.displayName ?? null,
        isMe: id === userId,
        visitedCounts: Object.fromEntries(
          NORM_CATEGORIES.map((cat) => [cat, counts[cat] ?? 0]),
        ),
        totalVisited,
      };
    });

    // 6. Sort by totalVisited desc, then by userId for stability
    entries.sort((a, b) => b.totalVisited - a.totalVisited || a.userId.localeCompare(b.userId));

    // Add rank (ties share rank)
    let rank = 1;
    const ranked = entries.map((e, i) => {
      if (i > 0 && entries[i].totalVisited < entries[i - 1].totalVisited) rank = i + 1;
      return { rank, ...e };
    });

    res.json({ leaderboard: ranked });
  } catch (err) {
    req.log.error({ err }, "Error fetching leaderboard");
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

export default router;
