# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### World Map (`artifacts/world-map`)
Interactive travel tracker built with React + Vite + TypeScript, react-simple-maps, Tailwind CSS.

**Features:**
- Clickable world map with 195 countries (continent-color-coded)
- US States and Canadian Provinces via zoomed sub-layers
- MLB Stadium flag markers (30 teams)
- Microstate dot markers (Vatican, Monaco, San Marino, etc.)
- Visited tracking with scratch-off style color reveals
- **Bucket List mode** — golden dashed-border map styling; ★ toggle on every list item; dedicated ★ Bucket List tab aggregating all categories
- Visit details panel (dates, notes, times visited) — shown only for visited items
- Progress counters + progress bars for all 4 categories + bucket list count
- localStorage persistence (wm_visited_*, wm_bucket_*, wm_details_*)
- CSV export and Excel import (xlsx) with download template
- Search bar with autocomplete + fly-to (zoom + pan) behavior
- Tooltip on hover, zoom controls, reset
- Share URL — encodes visited/bucket sets (incl. TCC) into a compressed URL hash for read-only sharing
- **TCC mode** (Travelers' Century Club) — second map mode tracking 330 countries/territories across 12 regions:
  - Header toggle: 🌍 World ↔ ✈️ TCC X/330
  - Map repaints with TCC region colors (full-saturation = visited, muted = unvisited, amber-dashed = bucket)
  - Country shapes (where geoId maps) tinted; non-geo entries (microstates, oceans, territories) shown as small region-colored dots
  - Dedicated TCC list tab with region-pill legend (per-region X/Y counts), checkbox toggle, ★ bucket, 🗺 indicator for entries with map shapes
  - Sidebar TCC info panel with region badge, region/location/membership cards, Mark Visited/Bucket List buttons, VisitDetailsPanel for visited entries
  - Milestone celebratory banner above header at 100 visited (TCC membership threshold)
  - Independent localStorage: `wm_map_mode`, `wm_tcc_visited`, `wm_tcc_bucket`, `wm_details_tcc`
  - Bucket-list tab aggregates TCC entries (purple "TCC" badge); navigating to one auto-switches mapMode to "tcc"
  - Read-only mode (when viewing a Share URL) hides all TCC mutation controls and toggle handlers no-op

**Key state:** visited/bucket Sets per category, details Records per category, confirmBucket string|null for UX confirmation when moving visited → bucket. mapMode "world"|"tcc" persisted across reloads.

**Key constants:** BUCKET_LIST_COLOR="#a37c1a", BUCKET_LIST_STROKE="#fbbf24", TCC_TOTAL=330, TCC_MEMBERSHIP_THRESHOLD=100

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
