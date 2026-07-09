import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, userMapDataTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/map-data", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [row] = await db
    .select()
    .from(userMapDataTable)
    .where(eq(userMapDataTable.userId, userId));

  res.json({ data: row?.data ?? null });
});

router.put("/map-data", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const data = req.body as Record<string, unknown>;

  await db
    .insert(userMapDataTable)
    .values({ userId, data })
    .onConflictDoUpdate({
      target: userMapDataTable.userId,
      set: { data, updatedAt: new Date() },
    });

  res.json({ ok: true });
});

export default router;
