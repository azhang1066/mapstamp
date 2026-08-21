/**
 * Integration tests for the connections lifecycle:
 *   POST /connections/request/:userId
 *   POST /connections/:id/accept
 *   POST /connections/:id/decline
 *   DELETE /connections/:id
 *   GET  /connections
 *
 * Uses the real DATABASE_URL Postgres instance.
 * Clerk auth is mocked so tests control userId without live JWTs.
 * Both test users and their profile rows are wiped before each suite
 * and after the last test to keep the DB clean.
 */

// ─── Module mocks (auto-hoisted by vitest) ────────────────────────────────────

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: vi.fn(() => ({ userId: REQUESTER_ID })),
}));

vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => "pk_test_mock",
}));

vi.mock("../middlewares/clerkProxyMiddleware", () => ({
  CLERK_PROXY_PATH: "/__clerk_proxy_mock",
  clerkProxyMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getClerkProxyHost: () => null,
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import {
  describe,
  it,
  expect,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import request from "supertest";
import { getAuth } from "@clerk/express";
import app from "../app";
import { db, userConnectionsTable, userProfilesTable } from "@workspace/db";
import { or, eq, and } from "drizzle-orm";

// ─── Test constants ───────────────────────────────────────────────────────────

// Must match the hardcoded string in the vi.mock factory above.
const REQUESTER_ID = "test_conn_requester";
const ADDRESSEE_ID = "test_conn_addressee";
const THIRD_ID     = "test_conn_third";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Remove all connections involving any of our test users. */
async function wipeConnections() {
  const ids = [REQUESTER_ID, ADDRESSEE_ID, THIRD_ID];
  for (const id of ids) {
    await db
      .delete(userConnectionsTable)
      .where(
        or(
          eq(userConnectionsTable.requesterId, id),
          eq(userConnectionsTable.addresseeId, id),
        ),
      );
  }
}

/** Remove stub profile rows for our test users. */
async function wipeProfiles() {
  for (const id of [REQUESTER_ID, ADDRESSEE_ID, THIRD_ID]) {
    await db
      .delete(userProfilesTable)
      .where(eq(userProfilesTable.userId, id));
  }
}

/** Insert a minimal profile so the "does addressee exist?" check passes. */
async function seedProfiles() {
  const rows = [
    { userId: REQUESTER_ID, username: "requester_user", displayName: "Requester" },
    { userId: ADDRESSEE_ID, username: "addressee_user", displayName: "Addressee" },
    { userId: THIRD_ID,     username: "third_user",     displayName: "Third"     },
  ];
  for (const row of rows) {
    await db
      .insert(userProfilesTable)
      .values(row)
      .onConflictDoNothing();
  }
}

/** Make the mocked getAuth return a specific userId for the next call only. */
function asUser(userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(getAuth).mockReturnValueOnce({ userId } as any);
}

/** Send a connection request from REQUESTER → ADDRESSEE and return the connection id. */
async function sendRequest(): Promise<string> {
  const res = await request(app)
    .post(`/api/connections/request/${ADDRESSEE_ID}`);
  expect(res.status).toBe(201);
  return res.body.id as string;
}

// ─── Suite setup ──────────────────────────────────────────────────────────────

beforeEach(async () => {
  await wipeConnections();
  await seedProfiles();
});

afterAll(async () => {
  await wipeConnections();
  await wipeProfiles();
});

// ─── Authentication guards ────────────────────────────────────────────────────

describe("Authentication — 401 when unauthenticated", () => {
  it("GET /connections returns 401", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getAuth).mockReturnValueOnce({ userId: null } as any);
    const res = await request(app).get("/api/connections");
    expect(res.status).toBe(401);
  });

  it("POST /connections/request/:userId returns 401", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getAuth).mockReturnValueOnce({ userId: null } as any);
    const res = await request(app).post(`/api/connections/request/${ADDRESSEE_ID}`);
    expect(res.status).toBe(401);
  });

  it("POST /connections/:id/accept returns 401", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getAuth).mockReturnValueOnce({ userId: null } as any);
    const res = await request(app).post("/api/connections/fake-id/accept");
    expect(res.status).toBe(401);
  });

  it("POST /connections/:id/decline returns 401", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getAuth).mockReturnValueOnce({ userId: null } as any);
    const res = await request(app).post("/api/connections/fake-id/decline");
    expect(res.status).toBe(401);
  });

  it("DELETE /connections/:id returns 401", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getAuth).mockReturnValueOnce({ userId: null } as any);
    const res = await request(app).delete("/api/connections/fake-id");
    expect(res.status).toBe(401);
  });
});

// ─── Sending requests ─────────────────────────────────────────────────────────

describe("POST /connections/request/:userId — sending a request", () => {
  it("creates a pending request and returns 201 with id+status", async () => {
    const res = await request(app).post(`/api/connections/request/${ADDRESSEE_ID}`);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "pending" });
    expect(typeof res.body.id).toBe("string");
  });

  it("returns 409 when a request to the same user already exists", async () => {
    await sendRequest();
    const res = await request(app).post(`/api/connections/request/${ADDRESSEE_ID}`);
    expect(res.status).toBe(409);
  });

  it("returns 409 even when the other user already sent a request first", async () => {
    // Addressee sends first
    asUser(ADDRESSEE_ID);
    await request(app).post(`/api/connections/request/${REQUESTER_ID}`).expect(201);
    // Now requester tries to send — should be blocked
    const res = await request(app).post(`/api/connections/request/${ADDRESSEE_ID}`);
    expect(res.status).toBe(409);
  });

  it("returns 400 when targeting yourself", async () => {
    const res = await request(app).post(`/api/connections/request/${REQUESTER_ID}`);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the target user has no profile", async () => {
    const res = await request(app).post("/api/connections/request/nonexistent-user-xyz");
    expect(res.status).toBe(404);
  });
});

// ─── Accepting a request ─────────────────────────────────────────────────────

describe("POST /connections/:id/accept", () => {
  it("addressee can accept a pending request → status becomes accepted", async () => {
    const id = await sendRequest();

    asUser(ADDRESSEE_ID);
    const res = await request(app).post(`/api/connections/${id}/accept`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, status: "accepted" });
  });

  it("requester cannot accept their own outgoing request", async () => {
    const id = await sendRequest();

    // Still acting as REQUESTER (default mock)
    const res = await request(app).post(`/api/connections/${id}/accept`);
    expect(res.status).toBe(403);
  });

  it("a third party cannot accept someone else's request", async () => {
    const id = await sendRequest();

    asUser(THIRD_ID);
    const res = await request(app).post(`/api/connections/${id}/accept`);
    expect(res.status).toBe(403);
  });

  it("returns 409 when the request was already accepted", async () => {
    const id = await sendRequest();

    asUser(ADDRESSEE_ID);
    await request(app).post(`/api/connections/${id}/accept`).expect(200);

    asUser(ADDRESSEE_ID);
    const res = await request(app).post(`/api/connections/${id}/accept`);
    expect(res.status).toBe(409);
  });

  it("returns 409 when the request was already declined", async () => {
    const id = await sendRequest();

    asUser(ADDRESSEE_ID);
    await request(app).post(`/api/connections/${id}/decline`).expect(200);

    asUser(ADDRESSEE_ID);
    const res = await request(app).post(`/api/connections/${id}/accept`);
    expect(res.status).toBe(409);
  });

  it("returns 404 for a non-existent connection id", async () => {
    asUser(ADDRESSEE_ID);
    const res = await request(app).post(
      "/api/connections/00000000-0000-0000-0000-000000000000/accept",
    );
    expect(res.status).toBe(404);
  });
});

// ─── Declining a request ─────────────────────────────────────────────────────

describe("POST /connections/:id/decline", () => {
  it("addressee can decline a pending request → status becomes declined", async () => {
    const id = await sendRequest();

    asUser(ADDRESSEE_ID);
    const res = await request(app).post(`/api/connections/${id}/decline`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, status: "declined" });
  });

  it("requester cannot decline their own outgoing request", async () => {
    const id = await sendRequest();

    const res = await request(app).post(`/api/connections/${id}/decline`);
    expect(res.status).toBe(403);
  });

  it("a third party cannot decline someone else's request", async () => {
    const id = await sendRequest();

    asUser(THIRD_ID);
    const res = await request(app).post(`/api/connections/${id}/decline`);
    expect(res.status).toBe(403);
  });

  it("returns 409 when the request was already accepted", async () => {
    const id = await sendRequest();

    asUser(ADDRESSEE_ID);
    await request(app).post(`/api/connections/${id}/accept`).expect(200);

    asUser(ADDRESSEE_ID);
    const res = await request(app).post(`/api/connections/${id}/decline`);
    expect(res.status).toBe(409);
  });

  it("returns 404 for a non-existent connection id", async () => {
    asUser(ADDRESSEE_ID);
    const res = await request(app).post(
      "/api/connections/00000000-0000-0000-0000-000000000000/decline",
    );
    expect(res.status).toBe(404);
  });
});

// ─── Removing a connection ────────────────────────────────────────────────────

describe("DELETE /connections/:id", () => {
  it("requester can delete their own pending request", async () => {
    const id = await sendRequest();
    const res = await request(app).delete(`/api/connections/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  it("addressee can delete an accepted connection", async () => {
    const id = await sendRequest();
    asUser(ADDRESSEE_ID);
    await request(app).post(`/api/connections/${id}/accept`).expect(200);

    asUser(ADDRESSEE_ID);
    const res = await request(app).delete(`/api/connections/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  it("a third party cannot delete someone else's connection", async () => {
    const id = await sendRequest();

    asUser(THIRD_ID);
    const res = await request(app).delete(`/api/connections/${id}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for a non-existent connection id", async () => {
    const res = await request(app).delete(
      "/api/connections/00000000-0000-0000-0000-000000000000",
    );
    expect(res.status).toBe(404);
  });
});

// ─── Listing connections ──────────────────────────────────────────────────────

describe("GET /connections — listing", () => {
  it("returns empty lists when the user has no connections", async () => {
    const res = await request(app).get("/api/connections");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      pending: { incoming: [], outgoing: [] },
      accepted: [],
    });
  });

  it("outgoing request appears in pending.outgoing for the requester", async () => {
    await sendRequest();

    const res = await request(app).get("/api/connections");
    expect(res.status).toBe(200);
    expect(res.body.pending.outgoing).toHaveLength(1);
    expect(res.body.pending.outgoing[0]).toMatchObject({
      status: "pending",
      direction: "outgoing",
      otherUser: { userId: ADDRESSEE_ID },
    });
    expect(res.body.pending.incoming).toHaveLength(0);
    expect(res.body.accepted).toHaveLength(0);
  });

  it("incoming request appears in pending.incoming for the addressee", async () => {
    await sendRequest();

    asUser(ADDRESSEE_ID);
    const res = await request(app).get("/api/connections");
    expect(res.status).toBe(200);
    expect(res.body.pending.incoming).toHaveLength(1);
    expect(res.body.pending.incoming[0]).toMatchObject({
      status: "pending",
      direction: "incoming",
      otherUser: { userId: REQUESTER_ID },
    });
    expect(res.body.pending.outgoing).toHaveLength(0);
  });

  it("accepted connection appears in accepted for both parties", async () => {
    const id = await sendRequest();

    asUser(ADDRESSEE_ID);
    await request(app).post(`/api/connections/${id}/accept`).expect(200);

    // Check requester's view
    const requesterRes = await request(app).get("/api/connections");
    expect(requesterRes.body.accepted).toHaveLength(1);
    expect(requesterRes.body.accepted[0]).toMatchObject({ status: "accepted" });
    expect(requesterRes.body.pending.outgoing).toHaveLength(0);

    // Check addressee's view
    asUser(ADDRESSEE_ID);
    const addresseeRes = await request(app).get("/api/connections");
    expect(addresseeRes.body.accepted).toHaveLength(1);
    expect(addresseeRes.body.accepted[0]).toMatchObject({ status: "accepted" });
    expect(addresseeRes.body.pending.incoming).toHaveLength(0);
  });

  it("declined request does not appear in any list for either party", async () => {
    const id = await sendRequest();

    asUser(ADDRESSEE_ID);
    await request(app).post(`/api/connections/${id}/decline`).expect(200);

    // Requester sees nothing
    const requesterRes = await request(app).get("/api/connections");
    expect(requesterRes.body.pending.outgoing).toHaveLength(0);
    expect(requesterRes.body.accepted).toHaveLength(0);

    // Addressee sees nothing
    asUser(ADDRESSEE_ID);
    const addresseeRes = await request(app).get("/api/connections");
    expect(addresseeRes.body.pending.incoming).toHaveLength(0);
    expect(addresseeRes.body.accepted).toHaveLength(0);
  });
});
