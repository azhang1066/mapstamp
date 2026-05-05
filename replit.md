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

**Key state:** visited/bucket Sets per category, details Records per category, confirmBucket string|null for UX confirmation when moving visited → bucket.

**Key constants:** BUCKET_LIST_COLOR="#a37c1a", BUCKET_LIST_STROKE="#fbbf24"

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
