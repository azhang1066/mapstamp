import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, userProfilesTable } from "@workspace/db";
import { sql, ne } from "drizzle-orm";

const router: IRouter = Router();

// ─── GET /users/search?q= ─────────────────────────────────────────────────────
// Prefix-match on username (case-insensitive). Never returns travel data.

router.get("/users/search", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const q = String(req.query.q ?? "").trim().toLowerCase();
  if (!q || q.length < 2) {
    res.status(400).json({ error: "q must be at least 2 characters" });
    return;
  }
  if (q.length > 30) {
    res.status(400).json({ error: "q must be at most 30 characters" });
    return;
  }

  try {
    const rows = await db
      .select({
        userId: userProfilesTable.userId,
        username: userProfilesTable.username,
        displayName: userProfilesTable.displayName,
      })
      .from(userProfilesTable)
      .where(
        sql`lower(${userProfilesTable.username}) LIKE ${q + "%"} AND ${userProfilesTable.userId} != ${userId}`,
      )
      .limit(20);

    res.json({ users: rows.map((r) => ({ ...r, displayName: r.displayName ?? null })) });
  } catch (err) {
    req.log.error({ err }, "Error searching users");
    res.status(500).json({ error: "Failed to search users" });
  }
});

export default router;
