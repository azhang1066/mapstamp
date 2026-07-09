import { Router, type IRouter, type Request, type Response } from "express";
import { db, userMapDataTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/map-data", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [row] = await db
    .select()
    .from(userMapDataTable)
    .where(eq(userMapDataTable.userId, req.user.id));

  res.json({ data: row?.data ?? null });
});

router.put("/map-data", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const data = req.body as Record<string, unknown>;

  await db
    .insert(userMapDataTable)
    .values({ userId: req.user.id, data })
    .onConflictDoUpdate({
      target: userMapDataTable.userId,
      set: { data, updatedAt: new Date() },
    });

  res.json({ ok: true });
});

export default router;
