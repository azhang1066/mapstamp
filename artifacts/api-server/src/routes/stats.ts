import { Router, type IRouter, type Request, type Response } from "express";
import { db, userDestinationsTable, userMapDataTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

const VALID_CATEGORIES = new Set(["country", "us_state", "ca_province", "tcc"]);

// ─── GET /stats/aggregate?category=X&limit=N ──────────────────────────────────

router.get("/stats/aggregate", async (req: Request, res: Response) => {
  const { category, limit: limitStr } = req.query as {
    category?: string;
    limit?: string;
  };

  if (!category || !VALID_CATEGORIES.has(category)) {
    res
      .status(400)
      .json({ error: "category must be one of: country, us_state, ca_province, tcc" });
    return;
  }

  const limit = Math.min(200, Math.max(1, parseInt(limitStr ?? "50", 10) || 50));

  try {
    const [destinationsResult, totalUsersResult] = await Promise.all([
      db
        .select({
          destinationId: userDestinationsTable.destinationId,
          visitedCount: sql<number>`COUNT(*) FILTER (WHERE ${userDestinationsTable.isVisited})::int`,
          bucketCount: sql<number>`COUNT(*) FILTER (WHERE ${userDestinationsTable.isBucket})::int`,
        })
        .from(userDestinationsTable)
        .where(eq(userDestinationsTable.category, category))
        .groupBy(userDestinationsTable.destinationId)
        .orderBy(
          sql`COUNT(*) FILTER (WHERE ${userDestinationsTable.isVisited}) DESC`,
        )
        .limit(limit),

      db
        .select({ count: sql<number>`COUNT(DISTINCT user_id)::int` })
        .from(userMapDataTable),
    ]);

    res.json({
      category,
      totalUsers: totalUsersResult[0]?.count ?? 0,
      destinations: destinationsResult,
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching aggregate stats");
    res.status(500).json({ error: "Failed to fetch aggregate stats" });
  }
});

// ─── GET /stats/destination/:category/:id ────────────────────────────────────

router.get(
  "/stats/destination/:category/:id",
  async (req: Request, res: Response) => {
    const category = String(req.params.category);
    const destinationId = String(req.params.id);

    if (!VALID_CATEGORIES.has(category)) {
      res
        .status(400)
        .json({ error: "category must be one of: country, us_state, ca_province, tcc" });
      return;
    }

    try {
      const [destResult, totalUsersResult] = await Promise.all([
        db
          .select({
            visitedCount: sql<number>`COUNT(*) FILTER (WHERE ${userDestinationsTable.isVisited})::int`,
            bucketCount: sql<number>`COUNT(*) FILTER (WHERE ${userDestinationsTable.isBucket})::int`,
          })
          .from(userDestinationsTable)
          .where(
            sql`${userDestinationsTable.category} = ${category} AND ${userDestinationsTable.destinationId} = ${destinationId}`,
          ),

        db
          .select({ count: sql<number>`COUNT(DISTINCT user_id)::int` })
          .from(userMapDataTable),
      ]);

      const totalUsers = totalUsersResult[0]?.count ?? 0;
      const visitedCount = destResult[0]?.visitedCount ?? 0;
      const bucketCount = destResult[0]?.bucketCount ?? 0;

      if (visitedCount === 0 && bucketCount === 0) {
        res.status(404).json({ error: "No data found for this destination" });
        return;
      }

      res.json({
        category,
        destinationId,
        visitedCount,
        bucketCount,
        totalUsers,
        visitedPct:
          totalUsers > 0
            ? Math.round((visitedCount / totalUsers) * 1000) / 10
            : 0,
        bucketPct:
          totalUsers > 0
            ? Math.round((bucketCount / totalUsers) * 1000) / 10
            : 0,
      });
    } catch (err) {
      req.log.error({ err }, "Error fetching destination stats");
      res.status(500).json({ error: "Failed to fetch destination stats" });
    }
  },
);

export default router;
