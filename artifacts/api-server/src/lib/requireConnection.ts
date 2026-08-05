/**
 * Shared authorization helper for comparison and leaderboard routes.
 * Throws ForbiddenError if the two users do not have an accepted mutual connection.
 */
import { db, userConnectionsTable } from "@workspace/db";
import { and, eq, or } from "drizzle-orm";

export class ForbiddenError extends Error {
  constructor(message = "No accepted connection between these users") {
    super(message);
    this.name = "ForbiddenError";
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * Resolves successfully if callerId and otherUserId share an accepted connection
 * (in either direction). Throws ForbiddenError otherwise.
 */
export async function requireAcceptedConnection(
  callerId: string,
  otherUserId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: userConnectionsTable.id })
    .from(userConnectionsTable)
    .where(
      and(
        eq(userConnectionsTable.status, "accepted"),
        or(
          and(
            eq(userConnectionsTable.requesterId, callerId),
            eq(userConnectionsTable.addresseeId, otherUserId),
          ),
          and(
            eq(userConnectionsTable.requesterId, otherUserId),
            eq(userConnectionsTable.addresseeId, callerId),
          ),
        ),
      ),
    )
    .limit(1);

  if (!row) throw new ForbiddenError();
}
