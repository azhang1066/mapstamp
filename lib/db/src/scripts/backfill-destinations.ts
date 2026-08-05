/**
 * One-time backfill: reads all user_map_data blobs, extracts visited/bucket
 * status + visit details for the four normalized categories (country, us_state,
 * ca_province, tcc), and populates user_destinations.
 *
 * Safe to re-run — uses INSERT ... ON CONFLICT DO UPDATE.
 *
 * Run with:
 *   pnpm --filter @workspace/db run backfill
 */
import { db, userMapDataTable, userDestinationsTable, type NewUserDestination } from "../index";
import { sql } from "drizzle-orm";

interface VisitDetails {
  timesVisited?: number;
  firstYear?: number;
  lastYear?: number;
}

interface MapPayload {
  visitedCountries?: string[];
  visitedStates?: string[];
  visitedProvinces?: string[];
  tccVisited?: string[];
  bucketCountries?: string[];
  bucketStates?: string[];
  bucketProvinces?: string[];
  tccBucket?: string[];
  countryDetails?: Record<string, VisitDetails>;
  stateDetails?: Record<string, VisitDetails>;
  provinceDetails?: Record<string, VisitDetails>;
  tccDetails?: Record<string, VisitDetails>;
}

function extractRows(userId: string, data: MapPayload): NewUserDestination[] {
  const groups = [
    {
      category: "country",
      visited: data.visitedCountries ?? [],
      bucket: data.bucketCountries ?? [],
      details: data.countryDetails ?? {},
    },
    {
      category: "us_state",
      visited: data.visitedStates ?? [],
      bucket: data.bucketStates ?? [],
      details: data.stateDetails ?? {},
    },
    {
      category: "ca_province",
      visited: data.visitedProvinces ?? [],
      bucket: data.bucketProvinces ?? [],
      details: data.provinceDetails ?? {},
    },
    {
      category: "tcc",
      visited: data.tccVisited ?? [],
      bucket: data.tccBucket ?? [],
      details: data.tccDetails ?? {},
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

async function main() {
  console.log("=== user_destinations backfill ===\n");

  // Read all existing blobs
  const allMapRows = await db.select().from(userMapDataTable);
  console.log(`Found ${allMapRows.length} user_map_data rows to process.\n`);

  let totalDestinations = 0;
  let usersWithData = 0;
  let usersProcessed = 0;

  for (const mapRow of allMapRows) {
    const data = mapRow.data as MapPayload;
    const rows = extractRows(mapRow.userId, data);
    if (rows.length === 0) {
      usersProcessed++;
      continue;
    }

    usersWithData++;
    totalDestinations += rows.length;

    // Upsert all rows for this user — idempotent
    await db
      .insert(userDestinationsTable)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          userDestinationsTable.userId,
          userDestinationsTable.category,
          userDestinationsTable.destinationId,
        ],
        set: {
          isVisited: sql`EXCLUDED.is_visited`,
          isBucket: sql`EXCLUDED.is_bucket`,
          firstVisitedYear: sql`EXCLUDED.first_visited_year`,
          lastVisitedYear: sql`EXCLUDED.last_visited_year`,
          timesVisited: sql`EXCLUDED.times_visited`,
          updatedAt: new Date(),
        },
      });

    usersProcessed++;
    if (usersProcessed % 50 === 0) {
      console.log(`  Processed ${usersProcessed}/${allMapRows.length} users…`);
    }
  }

  console.log(`\n✅ Backfill complete.`);
  console.log(`   Users processed:       ${allMapRows.length}`);
  console.log(`   Users with data:       ${usersWithData}`);
  console.log(`   Destination rows written: ${totalDestinations}`);

  // ── Verification queries ──────────────────────────────────────────────────

  console.log("\n=== Verification ===\n");

  const byCategoryResult = await db.execute(sql`
    SELECT category, COUNT(*)::int AS rows
    FROM user_destinations
    GROUP BY category
    ORDER BY category
  `);
  console.log("Rows by category:");
  for (const row of byCategoryResult.rows) {
    console.log(`  ${String(row.category).padEnd(15)} ${row.rows}`);
  }

  const distinctUsers = await db.execute(sql`
    SELECT COUNT(DISTINCT user_id)::int AS n FROM user_destinations
  `);
  console.log(`\nDistinct users in user_destinations: ${distinctUsers.rows[0]?.n}`);

  // Spot-check: pick up to 3 users and compare their old jsonb vs new table
  const sampleUsers = allMapRows.slice(0, 3);
  if (sampleUsers.length > 0) {
    console.log("\nSpot-check (first 3 users):");
    for (const sample of sampleUsers) {
      const oldData = sample.data as MapPayload;
      const oldVisited = (oldData.visitedCountries ?? []).length;
      const oldBucket = (oldData.bucketCountries ?? []).length;

      const newRows = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE is_visited)::int AS visited,
          COUNT(*) FILTER (WHERE is_bucket)::int  AS bucket
        FROM user_destinations
        WHERE user_id = ${sample.userId} AND category = 'country'
      `);
      const newVisited = newRows.rows[0]?.visited ?? 0;
      const newBucket = newRows.rows[0]?.bucket ?? 0;

      const matchV = oldVisited === Number(newVisited) ? "✅" : "❌";
      const matchB = oldBucket === Number(newBucket) ? "✅" : "❌";
      console.log(
        `  user ${sample.userId.slice(0, 12)}… ` +
          `countries: old=${oldVisited} new=${newVisited} ${matchV} | ` +
          `bucket: old=${oldBucket} new=${newBucket} ${matchB}`,
      );
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
