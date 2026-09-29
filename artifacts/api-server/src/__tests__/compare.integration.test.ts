/**
 * Comparison API privacy and authorization tests against the real test database.
 * Clerk identity is mocked, following the other integration suites.
 */
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: vi.fn(() => ({ userId: ME })),
}));
vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => "pk_test_mock",
}));
vi.mock("../middlewares/clerkProxyMiddleware", () => ({
  CLERK_PROXY_PATH: "/__clerk_proxy_mock",
  clerkProxyMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getClerkProxyHost: () => null,
}));

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { getAuth } from "@clerk/express";
import { db, userConnectionsTable, userDestinationsTable, userMapDataTable, userPhotosTable, userProfilesTable } from "@workspace/db";
import { inArray, or } from "drizzle-orm";
import app from "../app";

const ME = "test_compare_me";
const FRIEND = "test_compare_friend";
const STRANGER = "test_compare_stranger";
const ids = [ME, FRIEND, STRANGER];

async function clean() {
  await db.delete(userConnectionsTable).where(or(inArray(userConnectionsTable.requesterId, ids), inArray(userConnectionsTable.addresseeId, ids)));
  await db.delete(userDestinationsTable).where(inArray(userDestinationsTable.userId, ids));
  await db.delete(userMapDataTable).where(inArray(userMapDataTable.userId, ids));
  await db.delete(userPhotosTable).where(inArray(userPhotosTable.userId, ids));
  await db.delete(userProfilesTable).where(inArray(userProfilesTable.userId, ids));
}

async function connect(status: "pending" | "accepted" | "declined", reverse = false) {
  await db.insert(userConnectionsTable).values({
    requesterId: reverse ? FRIEND : ME,
    addresseeId: reverse ? ME : FRIEND,
    status,
  });
}

beforeEach(async () => {
  vi.mocked(getAuth).mockReset();
  vi.mocked(getAuth).mockImplementation(() => ({ userId: ME }) as ReturnType<typeof getAuth>);
  await clean();
  await db.insert(userProfilesTable).values([
    { userId: ME, username: "test_compare_me", displayName: "My name" },
    { userId: FRIEND, username: "test_compare_friend", displayName: "Friend name" },
    { userId: STRANGER, username: "test_compare_stranger", displayName: "Stranger" },
  ]);
});
afterAll(clean);

describe("GET /api/compare/:otherUserId", () => {
  it("returns 401 without auth, even when the auth helper throws", async () => {
    vi.mocked(getAuth).mockImplementationOnce(() => ({ userId: null }) as ReturnType<typeof getAuth>);
    const unauthenticated = await request(app).get(`/api/compare/${FRIEND}`);
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers["cache-control"]).toBe("no-store");
    vi.mocked(getAuth).mockImplementationOnce(() => { throw new Error("Missing Clerk context"); });
    const erroredAuth = await request(app).get(`/api/compare/${FRIEND}`);
    expect(erroredAuth.status).toBe(401);
    expect(erroredAuth.headers["cache-control"]).toBe("no-store");
  });

  it("rejects self-comparison", async () => {
    const res = await request(app).get(`/api/compare/${ME}`);
    expect(res.status).toBe(400);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it.each(["none", "pending", "declined"] as const)("returns 403 for %s connections without leaking destinations", async (status) => {
    if (status !== "none") await connect(status);
    await db.insert(userDestinationsTable).values({
      userId: FRIEND, category: "country", destinationId: "FRA", isVisited: true,
    });
    const res = await request(app).get(`/api/compare/${FRIEND}`);
    expect(res.status).toBe(403);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(res.body)).not.toContain("FRA");
  });

  it("returns both profiles and exactly allowlisted normalized status, years and counts, never private JSONB/photos", async () => {
    await connect("accepted", true);
    await db.insert(userDestinationsTable).values([
      { userId: ME, category: "country", destinationId: "FRA", isVisited: true, isBucket: false, firstVisitedYear: 2010, lastVisitedYear: 2020, timesVisited: 3 },
      { userId: ME, category: "country", destinationId: "JPN", isVisited: false, isBucket: true },
      { userId: FRIEND, category: "country", destinationId: "FRA", isVisited: true, isBucket: true, firstVisitedYear: 2018, lastVisitedYear: 2023, timesVisited: 5 },
      { userId: FRIEND, category: "country", destinationId: "JPN", isVisited: true, isBucket: false, firstVisitedYear: 2022, lastVisitedYear: 2022, timesVisited: 2 },
      { userId: FRIEND, category: "tcc", destinationId: "Europe/London", isVisited: false, isBucket: true },
    ]);
    for (const userId of [ME, FRIEND]) {
      await db.insert(userMapDataTable).values({
        userId, data: {
          notesByKey: { "country:FRA": "PRIVATE_NOTE_SENTINEL" },
          photos: ["PRIVATE_JSON_PHOTO_SENTINEL"],
          favorites: ["PRIVATE_FAVORITE_SENTINEL"],
        },
      });
      await db.insert(userPhotosTable).values({
        userId, category: "country", destinationId: "FRA",
        storageKey: "/objects/PRIVATE_STORAGE_KEY_SENTINEL", caption: "PRIVATE_CAPTION_SENTINEL",
      });
    }

    const res = await request(app).get(`/api/compare/${FRIEND}`);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.me).toMatchObject({ userId: ME, username: "test_compare_me", displayName: "My name" });
    expect(res.body.other).toMatchObject({ userId: FRIEND, username: "test_compare_friend", displayName: "Friend name" });
    expect(Object.keys(res.body)).toEqual(["me", "other"]);
    for (const user of [res.body.me, res.body.other]) {
      expect(Object.keys(user).sort()).toEqual(["destinations", "displayName", "userId", "username"]);
      for (const destination of user.destinations) {
        expect(Object.keys(destination).sort()).toEqual([
          "category", "destinationId", "firstVisitedYear", "isBucket", "isVisited",
          "lastVisitedYear", "timesVisited", "userId",
        ]);
      }
    }
    expect(res.body.me.destinations).toEqual(expect.arrayContaining([
      { userId: ME, category: "country", destinationId: "FRA", isVisited: true, isBucket: false, firstVisitedYear: 2010, lastVisitedYear: 2020, timesVisited: 3 },
      { userId: ME, category: "country", destinationId: "JPN", isVisited: false, isBucket: true, firstVisitedYear: null, lastVisitedYear: null, timesVisited: null },
    ]));
    expect(res.body.other.destinations).toEqual(expect.arrayContaining([
      { userId: FRIEND, category: "country", destinationId: "FRA", isVisited: true, isBucket: true, firstVisitedYear: 2018, lastVisitedYear: 2023, timesVisited: 5 },
      { userId: FRIEND, category: "country", destinationId: "JPN", isVisited: true, isBucket: false, firstVisitedYear: 2022, lastVisitedYear: 2022, timesVisited: 2 },
    ]));
    // The API returns full normalized data; the client derives year-filtered
    // visited sets and bucket overlap from these rows.
    const visitedIn2022 = (rows: typeof res.body.me.destinations) =>
      rows.filter((row: { isVisited: boolean; firstVisitedYear: number | null; lastVisitedYear: number | null }) =>
        row.isVisited && row.firstVisitedYear !== null && row.lastVisitedYear !== null &&
        row.firstVisitedYear <= 2022 && row.lastVisitedYear >= 2022,
      ).map((row: { destinationId: string }) => row.destinationId);
    expect(visitedIn2022(res.body.me.destinations)).toEqual([]);
    expect(visitedIn2022(res.body.other.destinations)).toEqual(["FRA", "JPN"]);
    expect(res.body.me.destinations.filter((row: { isBucket: boolean; category: string; destinationId: string }) =>
      row.isBucket && res.body.other.destinations.some((friend: { isVisited: boolean; category: string; destinationId: string }) =>
        friend.isVisited && friend.category === row.category && friend.destinationId === row.destinationId,
      ),
    ).map((row: { destinationId: string }) => row.destinationId)).toEqual(["JPN"]);
    const serialized = JSON.stringify(res.body);
    for (const privateValue of ["PRIVATE_NOTE_SENTINEL", "PRIVATE_JSON_PHOTO_SENTINEL", "PRIVATE_FAVORITE_SENTINEL", "PRIVATE_STORAGE_KEY_SENTINEL", "PRIVATE_CAPTION_SENTINEL", "updatedAt"]) {
      expect(serialized).not.toContain(privateValue);
    }
  });
});