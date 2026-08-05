---
name: user_destinations normalized schema
description: Architecture of the normalized destination table and its read/write path in map-data routes.
---

## What it is
`user_destinations` table (Drizzle schema at `lib/db/src/schema/user_destinations.ts`) is the authoritative store for visited/bucket-list status for four categories: `country`, `us_state`, `ca_province`, `tcc`. One row per (user_id, category, destination_id) with boolean `is_visited` and `is_bucket` columns plus `first_visited_year`, `last_visited_year`, `times_visited` (smallint).

## What stays in user_map_data.data jsonb
Notes (`notesByKey`), profileName, schemaVersion, and stadiums/parks (not yet normalized). Old visited/bucket arrays are left in existing blobs untouched but no longer written by the new API path.

## Read path (GET /api/map-data)
Two parallel point-reads — `user_destinations WHERE user_id=?` and `user_map_data WHERE user_id=?` — assembled in Node.js. Response shape to frontend is identical.

## Write path (PUT /api/map-data)
Single DB transaction: DELETE all user's destination rows, INSERT current set, UPSERT jsonb blob. Frontend sends full payload every time so delete-then-insert is safe and simple.

## Aggregate endpoints (no auth)
- `GET /api/stats/aggregate?category=X&limit=N` — top destinations by visited count
- `GET /api/stats/destination/:category/:id` — visitedPct / bucketPct for one place

## lib/db build requirement
`lib/db` uses `composite: true` in tsconfig. Any schema change requires `pnpm --filter @workspace/db run build` before downstream packages (api-server) can typecheck against new declarations.

## Backfill
Script at `lib/db/src/scripts/backfill-destinations.ts`, run via `pnpm --filter @workspace/db run backfill`. Idempotent (ON CONFLICT DO UPDATE). Verified: 3 users, 124 destination rows, spot-checks matched.

**Why:** jsonb blob is not aggregatable with SQL; normalized table enables cross-user stats queries in O(rows) without deserializing every blob.

**How to apply:** When adding a new normalized category (e.g. stadiums), add it to `extractDestinationRows()` and `assemblePayload()` in `map-data.ts`, extend the backfill script's `groups` array, and re-run backfill.
