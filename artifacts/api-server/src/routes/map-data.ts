import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, userMapDataTable, userDestinationsTable, type NewUserDestination } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

const router: IRouter = Router();

// ─── Category mappings ────────────────────────────────────────────────────────

type NormCategory = "country" | "us_state" | "ca_province" | "tcc";

interface VisitDetails {
  timesVisited?: number;
  firstYear?: number;
  lastYear?: number;
}

interface MapPayload {
  schemaVersion?: number;
  visitedCountries?: string[];
  visitedStates?: string[];
  visitedProvinces?: string[];
  visitedStadiums?: string[];
  visitedParks?: string[];
  tccVisited?: string[];
  bucketCountries?: string[];
  bucketStates?: string[];
  bucketProvinces?: string[];
  bucketStadiums?: string[];
  bucketParks?: string[];
  tccBucket?: string[];
  countryDetails?: Record<string, VisitDetails>;
  stateDetails?: Record<string, VisitDetails>;
  provinceDetails?: Record<string, VisitDetails>;
  stadiumDetails?: Record<string, VisitDetails>;
  parkDetails?: Record<string, VisitDetails>;
  tccDetails?: Record<string, VisitDetails>;
  notesByKey?: Record<string, string>;
  profileName?: string;
}

// Build a list of NewUserDestination rows from the four normalized categories
function extractDestinationRows(
  userId: string,
  payload: MapPayload,
): NewUserDestination[] {
  const groups: Array<{
    category: NormCategory;
    visited: string[];
    bucket: string[];
    details: Record<string, VisitDetails>;
  }> = [
    {
      category: "country",
      visited: payload.visitedCountries ?? [],
      bucket: payload.bucketCountries ?? [],
      details: payload.countryDetails ?? {},
    },
    {
      category: "us_state",
      visited: payload.visitedStates ?? [],
      bucket: payload.bucketStates ?? [],
      details: payload.stateDetails ?? {},
    },
    {
      category: "ca_province",
      visited: payload.visitedProvinces ?? [],
      bucket: payload.bucketProvinces ?? [],
      details: payload.provinceDetails ?? {},
    },
    {
      category: "tcc",
      visited: payload.tccVisited ?? [],
      bucket: payload.tccBucket ?? [],
      details: payload.tccDetails ?? {},
    },
  ];

  const rowMap = new Map<string, NewUserDestination>();

  for (const { category, visited, bucket, details } of groups) {
    const allIds = new Set([...visited, ...bucket]);
    for (const destinationId of allIds) {
      const key = `${category}:${destinationId}`;
      const det = details[destinationId];
      rowMap.set(key, {
        userId,
        category,
        destinationId,
        isVisited: visited.includes(destinationId),
        isBucket: bucket.includes(destinationId),
        firstVisitedYear: det?.firstYear ?? null,
        lastVisitedYear: det?.lastYear ?? null,
        timesVisited: det?.timesVisited ?? null,
      });
    }
  }

  return Array.from(rowMap.values());
}

// Assemble the full MapPayload response from user_destinations rows + jsonb blob
function assemblePayload(
  destRows: Array<typeof userDestinationsTable.$inferSelect>,
  jsonb: MapPayload | null,
): MapPayload {
  const byCategory: Record<NormCategory, typeof destRows> = {
    country: [],
    us_state: [],
    ca_province: [],
    tcc: [],
  };
  for (const row of destRows) {
    if (row.category in byCategory) {
      byCategory[row.category as NormCategory].push(row);
    }
  }

  const buildArrays = (rows: typeof destRows, cat: NormCategory) => {
    const visited: string[] = [];
    const bucket: string[] = [];
    const details: Record<string, VisitDetails> = {};
    for (const row of rows) {
      if (row.isVisited) visited.push(row.destinationId);
      if (row.isBucket) bucket.push(row.destinationId);
      if (
        row.firstVisitedYear != null ||
        row.lastVisitedYear != null ||
        row.timesVisited != null
      ) {
        details[row.destinationId] = {
          ...(row.firstVisitedYear != null && { firstYear: row.firstVisitedYear }),
          ...(row.lastVisitedYear != null && { lastYear: row.lastVisitedYear }),
          ...(row.timesVisited != null && { timesVisited: row.timesVisited }),
        };
      }
      void cat;
    }
    return { visited, bucket, details };
  };

  const countries = buildArrays(byCategory.country, "country");
  const states = buildArrays(byCategory.us_state, "us_state");
  const provinces = buildArrays(byCategory.ca_province, "ca_province");
  const tcc = buildArrays(byCategory.tcc, "tcc");

  return {
    schemaVersion: jsonb?.schemaVersion ?? 2,
    // Normalized categories (from user_destinations)
    visitedCountries: countries.visited,
    bucketCountries: countries.bucket,
    countryDetails: countries.details,
    visitedStates: states.visited,
    bucketStates: states.bucket,
    stateDetails: states.details,
    visitedProvinces: provinces.visited,
    bucketProvinces: provinces.bucket,
    provinceDetails: provinces.details,
    tccVisited: tcc.visited,
    tccBucket: tcc.bucket,
    tccDetails: tcc.details,
    // Non-normalized (stadiums/parks remain in jsonb)
    visitedStadiums: jsonb?.visitedStadiums ?? [],
    bucketStadiums: jsonb?.bucketStadiums ?? [],
    stadiumDetails: jsonb?.stadiumDetails ?? {},
    visitedParks: jsonb?.visitedParks ?? [],
    bucketParks: jsonb?.bucketParks ?? [],
    parkDetails: jsonb?.parkDetails ?? {},
    // Free-text fields
    notesByKey: jsonb?.notesByKey ?? {},
    profileName: jsonb?.profileName,
  };
}

// The jsonb blob stores only fields not normalized into user_destinations
function buildJsonbPayload(payload: MapPayload): Record<string, unknown> {
  return {
    schemaVersion: 2,
    visitedStadiums: payload.visitedStadiums ?? [],
    bucketStadiums: payload.bucketStadiums ?? [],
    stadiumDetails: payload.stadiumDetails ?? {},
    visitedParks: payload.visitedParks ?? [],
    bucketParks: payload.bucketParks ?? [],
    parkDetails: payload.parkDetails ?? {},
    notesByKey: payload.notesByKey ?? {},
    ...(payload.profileName != null && { profileName: payload.profileName }),
  };
}

// ─── GET /map-data ────────────────────────────────────────────────────────────

router.get("/map-data", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // Two parallel point-reads
    const [destRows, mapRow] = await Promise.all([
      db
        .select()
        .from(userDestinationsTable)
        .where(eq(userDestinationsTable.userId, userId)),
      db
        .select()
        .from(userMapDataTable)
        .where(eq(userMapDataTable.userId, userId))
        .then((rows) => rows[0] ?? null),
    ]);

    if (destRows.length === 0 && mapRow === null) {
      res.json({ data: null });
      return;
    }

    const jsonb = (mapRow?.data ?? null) as MapPayload | null;
    res.json({ data: assemblePayload(destRows, jsonb) });
  } catch (err) {
    req.log.error({ err }, "Error loading map data");
    res.status(500).json({ error: "Failed to load map data" });
  }
});

// ─── PUT /map-data ────────────────────────────────────────────────────────────

router.put("/map-data", async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = req.body as MapPayload;
  const destRows = extractDestinationRows(userId, payload);
  const jsonbPayload = buildJsonbPayload(payload);

  try {
    await db.transaction(async (tx) => {
      // 1. Replace all destination rows for this user atomically
      await tx
        .delete(userDestinationsTable)
        .where(eq(userDestinationsTable.userId, userId));

      if (destRows.length > 0) {
        await tx.insert(userDestinationsTable).values(destRows);
      }

      // 2. Upsert the stripped jsonb (notes/stadiums/parks/profile)
      await tx
        .insert(userMapDataTable)
        .values({ userId, data: jsonbPayload })
        .onConflictDoUpdate({
          target: userMapDataTable.userId,
          set: { data: jsonbPayload, updatedAt: new Date() },
        });
    });

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Error saving map data");
    res.status(500).json({ error: "Failed to save map data" });
  }
});

export default router;
