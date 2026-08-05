/**
 * Integration tests for GET/PUT /api/map-data
 *
 * These run against the real DATABASE_URL Postgres instance.
 * Clerk auth is mocked so we control userId without a live JWT.
 */
import { vi, describe, it, expect, beforeEach, afterAll } from "vitest";
import pino from "pino";

// ─── Mock @clerk/express BEFORE importing the router ─────────────────────────

// NOTE: this string is repeated in the mock factory below because vi.mock is
// hoisted before const declarations are initialized.
const TEST_USER_ID = "__test_map_data_integration__";

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn().mockReturnValue({ userId: "__test_map_data_integration__" }),
  clerkMiddleware: vi.fn(
    () => (_req: unknown, _res: unknown, next: () => void) => next(),
  ),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import express, { type Request, type Response, type NextFunction } from "express";
import supertest from "supertest";
import mapDataRouter from "./map-data.js";
import { db, userDestinationsTable, userMapDataTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ─── Minimal test app ─────────────────────────────────────────────────────────

const silentLogger = pino({ level: "silent" });

function buildApp() {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  // Inject a silent pino logger so req.log.error() in the route doesn't blow up
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    (_req as Request & { log: typeof silentLogger }).log = silentLogger;
    next();
  });
  app.use("/api", mapDataRouter);
  return app;
}

const agent = supertest(buildApp());

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function cleanTestUser() {
  await db
    .delete(userDestinationsTable)
    .where(eq(userDestinationsTable.userId, TEST_USER_ID));
  await db
    .delete(userMapDataTable)
    .where(eq(userMapDataTable.userId, TEST_USER_ID));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/map-data", () => {
  beforeEach(cleanTestUser);
  afterAll(cleanTestUser);

  it("returns { data: null } for a user with no data", async () => {
    const res = await agent.get("/api/map-data").expect(200);
    expect(res.body).toEqual({ data: null });
  });
});

describe("PUT then GET /api/map-data — full round-trip", () => {
  beforeEach(cleanTestUser);
  afterAll(cleanTestUser);

  it("stores and retrieves a payload with all four normalized categories", async () => {
    const payload = {
      schemaVersion: 2,
      // Countries
      visitedCountries: ["US", "DE", "JP"],
      bucketCountries: ["FR", "JP"], // JP is in both
      countryDetails: {
        US: { timesVisited: 5, firstYear: 2010, lastYear: 2023 },
        DE: { timesVisited: 1, firstYear: 2019, lastYear: 2019 },
        JP: { timesVisited: 2, firstYear: 2021, lastYear: 2022 },
      },
      // US states
      visitedStates: ["CA", "NY"],
      bucketStates: ["TX"],
      stateDetails: {
        CA: { timesVisited: 10, firstYear: 2008, lastYear: 2024 },
      },
      // Canadian provinces
      visitedProvinces: ["BC"],
      bucketProvinces: ["ON", "QC"],
      provinceDetails: {
        BC: { timesVisited: 3, firstYear: 2015, lastYear: 2020 },
      },
      // TCC
      tccVisited: ["TCC_A", "TCC_B"],
      tccBucket: ["TCC_C"],
      tccDetails: {
        TCC_A: { timesVisited: 1, firstYear: 2017, lastYear: 2017 },
      },
      // Non-normalized (jsonb)
      visitedStadiums: ["STAD_1", "STAD_2"],
      bucketStadiums: ["STAD_3"],
      stadiumDetails: {
        STAD_1: { timesVisited: 2, firstYear: 2016, lastYear: 2018 },
      },
      visitedParks: ["PARK_A"],
      bucketParks: ["PARK_B"],
      parkDetails: {
        PARK_A: { firstYear: 2020, lastYear: 2020 },
      },
      notesByKey: { US: "Great country!", JP: "Want to go back" },
      profileName: "Test Traveler",
    };

    // PUT
    const putRes = await agent.put("/api/map-data").send(payload).expect(200);
    expect(putRes.body).toEqual({ ok: true });

    // GET
    const getRes = await agent.get("/api/map-data").expect(200);
    const data = getRes.body.data;

    expect(data).not.toBeNull();

    // Countries
    expect(data.visitedCountries.sort()).toEqual(["DE", "JP", "US"]);
    expect(data.bucketCountries.sort()).toEqual(["FR", "JP"]);
    expect(data.countryDetails.US).toEqual({ timesVisited: 5, firstYear: 2010, lastYear: 2023 });
    expect(data.countryDetails.DE).toEqual({ timesVisited: 1, firstYear: 2019, lastYear: 2019 });
    expect(data.countryDetails.JP).toEqual({ timesVisited: 2, firstYear: 2021, lastYear: 2022 });

    // States
    expect(data.visitedStates.sort()).toEqual(["CA", "NY"]);
    expect(data.bucketStates).toEqual(["TX"]);
    expect(data.stateDetails.CA).toEqual({ timesVisited: 10, firstYear: 2008, lastYear: 2024 });

    // Provinces
    expect(data.visitedProvinces).toEqual(["BC"]);
    expect(data.bucketProvinces.sort()).toEqual(["ON", "QC"]);
    expect(data.provinceDetails.BC).toEqual({ timesVisited: 3, firstYear: 2015, lastYear: 2020 });

    // TCC
    expect(data.tccVisited.sort()).toEqual(["TCC_A", "TCC_B"]);
    expect(data.tccBucket).toEqual(["TCC_C"]);
    expect(data.tccDetails.TCC_A).toEqual({ timesVisited: 1, firstYear: 2017, lastYear: 2017 });

    // Stadiums (jsonb pass-through)
    expect(data.visitedStadiums.sort()).toEqual(["STAD_1", "STAD_2"]);
    expect(data.bucketStadiums).toEqual(["STAD_3"]);
    expect(data.stadiumDetails.STAD_1).toEqual({ timesVisited: 2, firstYear: 2016, lastYear: 2018 });

    // Parks (jsonb pass-through)
    expect(data.visitedParks).toEqual(["PARK_A"]);
    expect(data.bucketParks).toEqual(["PARK_B"]);
    expect(data.parkDetails.PARK_A).toEqual({ firstYear: 2020, lastYear: 2020 });

    // Free-text
    expect(data.notesByKey).toEqual({ US: "Great country!", JP: "Want to go back" });
    expect(data.profileName).toBe("Test Traveler");
  });

  it("overwrites old data on a second PUT (no stale rows)", async () => {
    const first = {
      visitedCountries: ["US", "DE"],
      bucketCountries: [],
      countryDetails: {},
      visitedStates: [], bucketStates: [], stateDetails: {},
      visitedProvinces: [], bucketProvinces: [], provinceDetails: {},
      tccVisited: [], tccBucket: [], tccDetails: {},
      visitedStadiums: [], bucketStadiums: [], stadiumDetails: {},
      visitedParks: [], bucketParks: [], parkDetails: {},
      notesByKey: {},
    };
    await agent.put("/api/map-data").send(first).expect(200);

    const second = {
      visitedCountries: ["FR"],   // US and DE removed
      bucketCountries: [],
      countryDetails: {},
      visitedStates: [], bucketStates: [], stateDetails: {},
      visitedProvinces: [], bucketProvinces: [], provinceDetails: {},
      tccVisited: [], tccBucket: [], tccDetails: {},
      visitedStadiums: [], bucketStadiums: [], stadiumDetails: {},
      visitedParks: [], bucketParks: [], parkDetails: {},
      notesByKey: {},
    };
    await agent.put("/api/map-data").send(second).expect(200);

    const getRes = await agent.get("/api/map-data").expect(200);
    expect(getRes.body.data.visitedCountries).toEqual(["FR"]);
    // US and DE must NOT appear
    expect(getRes.body.data.visitedCountries).not.toContain("US");
    expect(getRes.body.data.visitedCountries).not.toContain("DE");
  });
});

describe("Edge case: destination in both visited and bucket", () => {
  beforeEach(cleanTestUser);
  afterAll(cleanTestUser);

  it("preserves both isVisited and isBucket flags for the same destination", async () => {
    const payload = {
      visitedCountries: ["JP"],
      bucketCountries: ["JP"],   // same destination in both
      countryDetails: { JP: { timesVisited: 1 } },
      visitedStates: [], bucketStates: [], stateDetails: {},
      visitedProvinces: [], bucketProvinces: [], provinceDetails: {},
      tccVisited: [], tccBucket: [], tccDetails: {},
      visitedStadiums: [], bucketStadiums: [], stadiumDetails: {},
      visitedParks: [], bucketParks: [], parkDetails: {},
      notesByKey: {},
    };

    await agent.put("/api/map-data").send(payload).expect(200);

    const getRes = await agent.get("/api/map-data").expect(200);
    const { data } = getRes.body;
    expect(data.visitedCountries).toContain("JP");
    expect(data.bucketCountries).toContain("JP");
    expect(data.countryDetails.JP).toEqual({ timesVisited: 1 });
  });
});

describe("Edge case: empty PUT then GET", () => {
  beforeEach(cleanTestUser);
  afterAll(cleanTestUser);

  it("returns an assembled (non-null) payload even when all arrays are empty", async () => {
    const empty = {
      visitedCountries: [], bucketCountries: [], countryDetails: {},
      visitedStates: [], bucketStates: [], stateDetails: {},
      visitedProvinces: [], bucketProvinces: [], provinceDetails: {},
      tccVisited: [], tccBucket: [], tccDetails: {},
      visitedStadiums: [], bucketStadiums: [], stadiumDetails: {},
      visitedParks: [], bucketParks: [], parkDetails: {},
      notesByKey: {},
    };

    await agent.put("/api/map-data").send(empty).expect(200);

    // After a PUT (even with empty arrays) the user_map_data row exists,
    // so GET should return a non-null assembled payload (not { data: null }).
    const getRes = await agent.get("/api/map-data").expect(200);
    expect(getRes.body.data).not.toBeNull();
    expect(getRes.body.data.visitedCountries).toEqual([]);
    expect(getRes.body.data.bucketCountries).toEqual([]);
  });
});
