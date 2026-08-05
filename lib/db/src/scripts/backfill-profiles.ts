/**
 * One-time backfill: creates a user_profiles row for every existing
 * user_map_data user that doesn't already have one, using an auto-generated
 * username seeded from their profileName in the jsonb blob.
 *
 * Safe to re-run — uses INSERT ... ON CONFLICT DO NOTHING.
 *
 * Run with:
 *   pnpm --filter @workspace/db run backfill:profiles
 */
import { db, userMapDataTable, userProfilesTable } from "../index";
import { sql } from "drizzle-orm";

// ── Minimal username helpers (inlined to avoid importing api-server lib) ──────

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6).padEnd(4, "0");
}

async function isUsernameTaken(username: string): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT 1 FROM user_profiles WHERE lower(username) = ${username} LIMIT 1`,
  );
  return result.rows.length > 0;
}

async function generateUniqueUsername(seed: string | null): Promise<string> {
  const base = slugify(seed ?? "") || "traveler";
  for (let i = 0; i < 10; i++) {
    const candidate = `${base}_${randomSuffix()}`;
    if (!(await isUsernameTaken(candidate))) return candidate;
  }
  return `${base}_${Date.now().toString(36).slice(-5)}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== user_profiles backfill ===\n");

  const allMapRows = await db.select().from(userMapDataTable);
  console.log(`Found ${allMapRows.length} user_map_data rows to process.\n`);

  let inserted = 0;
  let skipped = 0;

  for (const row of allMapRows) {
    const data = row.data as Record<string, unknown> | null;
    const displayName =
      typeof data?.profileName === "string" && data.profileName
        ? data.profileName
        : null;

    const username = await generateUniqueUsername(displayName);

    const result = await db
      .insert(userProfilesTable)
      .values({
        userId: row.userId,
        username,
        displayName,
        usernameSet: false,
      })
      .onConflictDoNothing()
      .returning({ userId: userProfilesTable.userId });

    if (result.length > 0) {
      inserted++;
      console.log(`  ✓ ${row.userId.slice(0, 16)}… → @${username}`);
    } else {
      skipped++;
      console.log(`  · ${row.userId.slice(0, 16)}… already has a profile, skipped`);
    }
  }

  console.log(`\n✅ Done. Inserted: ${inserted}, Skipped (already existed): ${skipped}`);

  // ── Verification ──────────────────────────────────────────────────────────
  console.log("\n=== Verification ===\n");

  const counts = await db.execute(sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE username_set = false)::int AS placeholder,
           COUNT(*) FILTER (WHERE username_set = true)::int  AS confirmed
    FROM user_profiles
  `);
  const c = counts.rows[0] as { total: number; placeholder: number; confirmed: number };
  console.log(`  Total profiles:      ${c.total}`);
  console.log(`  Placeholder names:   ${c.placeholder}`);
  console.log(`  Confirmed usernames: ${c.confirmed}`);

  const dupes = await db.execute(sql`
    SELECT lower(username) AS lname, COUNT(*)::int AS n
    FROM user_profiles
    GROUP BY lower(username)
    HAVING COUNT(*) > 1
  `);
  if (dupes.rows.length === 0) {
    console.log("\n  ✅ No duplicate usernames.");
  } else {
    console.log("\n  ❌ Duplicate usernames found (this should not happen):");
    for (const r of dupes.rows) console.log(`     ${r.lname} (${r.n} rows)`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
