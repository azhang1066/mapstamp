import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, userConnectionsTable, userProfilesTable } from "@workspace/db";
import { and, eq, or } from "drizzle-orm";

const router: IRouter = Router();

// ─── Helper: attach profile info to a connection row ─────────────────────────

async function withProfile(
  row: typeof userConnectionsTable.$inferSelect,
  callerId: string,
) {
  const otherUserId =
    row.requesterId === callerId ? row.addresseeId : row.requesterId;
  const [profile] = await db
    .select({
      username: userProfilesTable.username,
      displayName: userProfilesTable.displayName,
    })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, otherUserId));

  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt,
    respondedAt: row.respondedAt ?? null,
    direction: row.requesterId === callerId ? "outgoing" : "incoming",
    otherUser: {
      userId: otherUserId,
      username: profile?.username ?? null,
      displayName: profile?.displayName ?? null,
    },
  };
}

// ─── GET /connections ─────────────────────────────────────────────────────────

router.get("/connections", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const rows = await db
      .select()
      .from(userConnectionsTable)
      .where(
        or(
          eq(userConnectionsTable.requesterId, userId),
          eq(userConnectionsTable.addresseeId, userId),
        ),
      );

    const withProfiles = await Promise.all(rows.map((r) => withProfile(r, userId)));

    const incoming = withProfiles.filter(
      (r) => r.status === "pending" && r.direction === "incoming",
    );
    const outgoing = withProfiles.filter(
      (r) => r.status === "pending" && r.direction === "outgoing",
    );
    const accepted = withProfiles.filter((r) => r.status === "accepted");

    res.json({ pending: { incoming, outgoing }, accepted });
  } catch (err) {
    req.log.error({ err }, "Error listing connections");
    res.status(500).json({ error: "Failed to list connections" });
  }
});

// ─── POST /connections/request/:userId ───────────────────────────────────────

router.post("/connections/request/:userId", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const addresseeId = String(req.params.userId);
  if (addresseeId === userId) {
    res.status(400).json({ error: "Cannot connect to yourself" });
    return;
  }

  try {
    // Check the addressee exists
    const [addresseeProfile] = await db
      .select({ userId: userProfilesTable.userId })
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, addresseeId))
      .limit(1);
    if (!addresseeProfile) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Check no connection already exists in either direction
    const [existing] = await db
      .select()
      .from(userConnectionsTable)
      .where(
        or(
          and(
            eq(userConnectionsTable.requesterId, userId),
            eq(userConnectionsTable.addresseeId, addresseeId),
          ),
          and(
            eq(userConnectionsTable.requesterId, addresseeId),
            eq(userConnectionsTable.addresseeId, userId),
          ),
        ),
      )
      .limit(1);

    if (existing) {
      // A previously declined connection can be re-initiated: remove the stale
      // record and fall through to create a fresh pending request below.
      if (existing.status === "declined") {
        await db
          .delete(userConnectionsTable)
          .where(eq(userConnectionsTable.id, existing.id));
      } else {
        res.status(409).json({
          error: "A connection request already exists between these users",
          status: existing.status,
        });
        return;
      }
    }

    const [created] = await db
      .insert(userConnectionsTable)
      .values({ requesterId: userId, addresseeId, status: "pending" })
      .returning();

    res.status(201).json({ id: created.id, status: created.status });
  } catch (err) {
    req.log.error({ err }, "Error creating connection request");
    res.status(500).json({ error: "Failed to send connection request" });
  }
});

// ─── POST /connections/:id/accept ────────────────────────────────────────────

router.post("/connections/:id/accept", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = String(req.params.id);

  try {
    const [row] = await db
      .select()
      .from(userConnectionsTable)
      .where(eq(userConnectionsTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }
    if (row.addresseeId !== userId) {
      res.status(403).json({ error: "Only the addressee can accept a request" });
      return;
    }
    if (row.status !== "pending") {
      res.status(409).json({ error: `Connection is already ${row.status}` });
      return;
    }

    const [updated] = await db
      .update(userConnectionsTable)
      .set({ status: "accepted", respondedAt: new Date() })
      .where(eq(userConnectionsTable.id, id))
      .returning();

    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    req.log.error({ err }, "Error accepting connection");
    res.status(500).json({ error: "Failed to accept connection" });
  }
});

// ─── POST /connections/:id/decline ───────────────────────────────────────────

router.post("/connections/:id/decline", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = String(req.params.id);

  try {
    const [row] = await db
      .select()
      .from(userConnectionsTable)
      .where(eq(userConnectionsTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }
    if (row.addresseeId !== userId) {
      res.status(403).json({ error: "Only the addressee can decline a request" });
      return;
    }
    if (row.status !== "pending") {
      res.status(409).json({ error: `Connection is already ${row.status}` });
      return;
    }

    const [updated] = await db
      .update(userConnectionsTable)
      .set({ status: "declined", respondedAt: new Date() })
      .where(eq(userConnectionsTable.id, id))
      .returning();

    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    req.log.error({ err }, "Error declining connection");
    res.status(500).json({ error: "Failed to decline connection" });
  }
});

// ─── DELETE /connections/:id ──────────────────────────────────────────────────

router.delete("/connections/:id", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = String(req.params.id);

  try {
    const [row] = await db
      .select()
      .from(userConnectionsTable)
      .where(eq(userConnectionsTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Connection not found" });
      return;
    }
    if (row.requesterId !== userId && row.addresseeId !== userId) {
      res.status(403).json({ error: "Not authorized to remove this connection" });
      return;
    }

    await db
      .delete(userConnectionsTable)
      .where(eq(userConnectionsTable.id, id));

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting connection");
    res.status(500).json({ error: "Failed to remove connection" });
  }
});

export default router;
