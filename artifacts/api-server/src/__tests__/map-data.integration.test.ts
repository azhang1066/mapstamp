/**
 * Integration tests for GET/PUT /api/map-data
 *
 * Uses the real database (DATABASE_URL must be set) and a dedicated test
 * user ID that is wiped before each test and cleaned up after the suite.
 * Clerk auth is mocked to a no-op so no real Clerk keys are needed.
 */

// ─── Module mocks (auto-hoisted by vitest before any imports) ─────────────────

// getAuth is a vi.fn so individual tests can override the returned userId
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: vi.fn(() => ({ userId: TEST_USER_ID })),
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
import { db, userMapDataTable, userDestinationsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";

// ─── Test constants ───────────────────────────────────────────────────────────

// Must match the hardcoded string in the vi.mock factory above
const TEST_USER_ID = "test_mapdata_integration_user";
const OTHER_USER_ID = "test_mapdata_integration_other";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function wipeTestUsers() {
  const ids = [TEST_USER_ID, OTHER_USER_ID];
  for (const id of ids) {
    await db.delete(userDestinationsTable).where(eq(userDestinationsTable.userId, id));
    await db.delete(userMapDataTable).where(eq(userMapDataTable.userId, id));
  }
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("GET /api/map-data — authentication", () => {
  it("returns 401 when the user is not authenticated", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getAuth).mockReturnValueOnce({ userId: null } as any);
    const res = await request(app).get("/api/map-data");
    expect(res.status).toBe(401);
  });

  it("returns 401 on PUT when the user is not authenticated", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getAuth).mockReturnValueOnce({ userId: null } as any);
    const res = await request(app).put("/api/map-data").send({});
    expect(res.status).toBe(401);
  });
});

describe("GET /api/map-data — no existing data", () => {
  beforeEach(wipeTestUsers);
  afterAll(wipeTestUsers);

  it("returns data: null for a brand-new user", async () => {
    const res = await request(app).get("/api/map-data");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: null });
  });
});

describe("PUT → GET round-trip", () => {
  beforeEach(wipeTestUsers);
  afterAll(wipeTestUsers);

  const basePayload = {
    schemaVersion: 2,
    visitedCountries: ["FRA", "DEU", "JPN"],
    bucketCountries: ["BRA", "DEU"],          // DEU appears in both
    countryDetails: {
      FRA: { timesVisited: 3, firstYear: 2010, lastYear: 2022 },
      DEU: { timesVisited: 1, firstYear: 2018 },
    },
    visitedStates: ["CA", "NY"],
    bucketStates: ["TX"],
    stateDetails: {
      CA: { timesVisited: 5, firstYear: 2005, lastYear: 2023 },
    },
    visitedProvinces: ["ON"],
    bucketProvinces: [],
    provinceDetails: {},
    tccVisited: ["Europe/London", "Asia/Tokyo"],
    tccBucket: ["America/Sao_Paulo"],
    tccDetails: {
      "Europe/London": { timesVisited: 2, firstYear: 2015, lastYear: 2019 },
    },
    visitedStadiums: ["Wembley", "Camp Nou"],
    bucketStadiums: ["Maracana"],
    stadiumDetails: { Wembley: { timesVisited: 1 } },
    visitedParks: ["Yosemite"],
    bucketParks: [],
    parkDetails: {},
    notesByKey: {
      "country:FRA": "Amazing food",
      "state:CA": "Home away from home",
    },
    profileName: "Test Traveler",
  };

  it("PUT returns ok:true", async () => {
    const res = await request(app)
      .put("/api/map-data")
      .send(basePayload)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("all four normalized categories round-trip correctly", async () => {
    await request(app).put("/api/map-data").send(basePayload);
    const res = await request(app).get("/api/map-data");

    expect(res.status).toBe(200);
    const { data } = res.body;

    // Countries
    expect(data.visitedCountries).toHaveLength(3);
    expect(data.visitedCountries).toEqual(expect.arrayContaining(["FRA", "DEU", "JPN"]));
    expect(data.bucketCountries).toHaveLength(2);
    expect(data.bucketCountries).toEqual(expect.arrayContaining(["BRA", "DEU"]));

    // US states
    expect(data.visitedStates).toEqual(expect.arrayContaining(["CA", "NY"]));
    expect(data.bucketStates).toEqual(expect.arrayContaining(["TX"]));

    // Canadian provinces
    expect(data.visitedProvinces).toEqual(expect.arrayContaining(["ON"]));

    // TCC
    expect(data.tccVisited).toEqual(
      expect.arrayContaining(["Europe/London", "Asia/Tokyo"]),
    );
    expect(data.tccBucket).toEqual(expect.arrayContaining(["America/Sao_Paulo"]));
  });

  it("a destination in both visited and bucket lists round-trips as both", async () => {
    await request(app).put("/api/map-data").send(basePayload);
    const res = await request(app).get("/api/map-data");

    const { data } = res.body;
    // DEU is in both visitedCountries and bucketCountries
    expect(data.visitedCountries).toContain("DEU");
    expect(data.bucketCountries).toContain("DEU");

    // Only one row should exist in user_destinations for DEU
    const rows = await db
      .select()
      .from(userDestinationsTable)
      .where(eq(userDestinationsTable.userId, TEST_USER_ID));
    const deuRows = rows.filter(
      (r) => r.category === "country" && r.destinationId === "DEU",
    );
    expect(deuRows).toHaveLength(1);
    expect(deuRows[0].isVisited).toBe(true);
    expect(deuRows[0].isBucket).toBe(true);
  });

  it("visit details (firstYear, lastYear, timesVisited) round-trip correctly", async () => {
    await request(app).put("/api/map-data").send(basePayload);
    const res = await request(app).get("/api/map-data");

    const { data } = res.body;
    expect(data.countryDetails.FRA).toMatchObject({
      timesVisited: 3,
      firstYear: 2010,
      lastYear: 2022,
    });
    expect(data.countryDetails.DEU).toMatchObject({
      timesVisited: 1,
      firstYear: 2018,
    });
    expect(data.stateDetails.CA).toMatchObject({
      timesVisited: 5,
      firstYear: 2005,
      lastYear: 2023,
    });
    expect(data.tccDetails["Europe/London"]).toMatchObject({
      timesVisited: 2,
      firstYear: 2015,
      lastYear: 2019,
    });
  });

  it("notesByKey and profileName round-trip via jsonb", async () => {
    await request(app).put("/api/map-data").send(basePayload);
    const res = await request(app).get("/api/map-data");

    const { data } = res.body;
    expect(data.notesByKey["country:FRA"]).toBe("Amazing food");
    expect(data.notesByKey["state:CA"]).toBe("Home away from home");
    expect(data.profileName).toBe("Test Traveler");
  });

  it("stadiums and parks (jsonb-only) round-trip correctly", async () => {
    await request(app).put("/api/map-data").send(basePayload);
    const res = await request(app).get("/api/map-data");

    const { data } = res.body;
    expect(data.visitedStadiums).toEqual(expect.arrayContaining(["Wembley", "Camp Nou"]));
    expect(data.bucketStadiums).toEqual(expect.arrayContaining(["Maracana"]));
    expect(data.stadiumDetails.Wembley).toMatchObject({ timesVisited: 1 });
    expect(data.visitedParks).toEqual(expect.arrayContaining(["Yosemite"]));
  });

  it("a second PUT completely replaces the first (no stale destinations)", async () => {
    // First save: France + Germany
    await request(app)
      .put("/api/map-data")
      .send({ visitedCountries: ["FRA", "DEU"], bucketCountries: [] });

    // Second save: only Japan — France and Germany should be gone
    await request(app)
      .put("/api/map-data")
      .send({ visitedCountries: ["JPN"], bucketCountries: [] });

    const res = await request(app).get("/api/map-data");
    const { data } = res.body;

    expect(data.visitedCountries).toEqual(expect.arrayContaining(["JPN"]));
    expect(data.visitedCountries).not.toContain("FRA");
    expect(data.visitedCountries).not.toContain("DEU");

    // Verify in the DB directly — no stale rows
    const rows = await db
      .select()
      .from(userDestinationsTable)
      .where(eq(userDestinationsTable.userId, TEST_USER_ID));
    const countryRows = rows.filter((r) => r.category === "country");
    expect(countryRows).toHaveLength(1);
    expect(countryRows[0].destinationId).toBe("JPN");
  });

  it("a user with no visited destinations gets an empty (not null) payload back", async () => {
    await request(app)
      .put("/api/map-data")
      .send({ profileName: "Empty Traveler", notesByKey: { "country:USA": "home" } });

    const res = await request(app).get("/api/map-data");
    expect(res.status).toBe(200);
    const { data } = res.body;
    // Has data (not null) because there's a jsonb row
    expect(data).not.toBeNull();
    expect(data.visitedCountries).toEqual([]);
    expect(data.profileName).toBe("Empty Traveler");
    expect(data.notesByKey["country:USA"]).toBe("home");
  });
});

describe("PUT → GET isolation between users", () => {
  beforeEach(wipeTestUsers);
  afterAll(wipeTestUsers);

  it("one user's data does not bleed into another user's response", async () => {
    // Save data as TEST_USER_ID (default mock)
    await request(app)
      .put("/api/map-data")
      .send({ visitedCountries: ["FRA"], bucketCountries: [] });

    // Switch mock to OTHER_USER_ID for next requests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getAuth).mockReturnValue({ userId: OTHER_USER_ID } as any);

    const res = await request(app).get("/api/map-data");
    expect(res.body).toEqual({ data: null });

    // Restore default mock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getAuth).mockReturnValue({ userId: TEST_USER_ID } as any);
  });
});
