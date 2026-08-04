# World Map Travel Tracker — Project Documentation

## Overview

A full-stack interactive travel tracking web application built as a pnpm monorepo. Users can mark countries, US states, Canadian provinces, and Travelers' Century Club (TCC) territories as visited or bucket-listed, attach notes and photos, view statistics, and share their travel map via a compressed URL.

Authentication is handled by **Clerk**. Map data is persisted per-user in a **PostgreSQL** database via a shared **Express API server**. The frontend is a **React + Vite** app using `react-simple-maps` for SVG world map rendering.

---

## Monorepo Structure

```
workspace/
├── artifacts/
│   ├── world-map/          # React + Vite frontend (served at /)
│   └── api-server/         # Express 5 API server (served at /api)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks + fetch client
│   ├── api-zod/            # Generated Zod validation schemas
│   └── db/                 # Drizzle ORM schema + db client
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml     # Workspace package discovery + catalog pins
├── tsconfig.base.json      # Shared strict TypeScript defaults
├── tsconfig.json           # Root TS solution config (composite libs only)
└── package.json            # Root task orchestration
```

---

## Artifacts

### `artifacts/world-map` — Frontend (`@workspace/world-map`)

**Stack:** React 18, Vite, TypeScript, Tailwind CSS, `react-simple-maps`, `xlsx`, Clerk React SDK

**Entry point:** `src/main.tsx` → `src/AuthRoot.tsx` → `src/App.tsx`

#### Key Source Files

| File | Purpose |
|---|---|
| `src/App.tsx` | Root component. All map state, handlers, sidebar, header, list tabs, modals |
| `src/AuthRoot.tsx` | Clerk provider + sign-in gate; switches between read-only share mode and authenticated mode |
| `src/auth-types.ts` | Shared auth-related TypeScript types |
| `src/countryData.ts` | 195 countries: names, ISO codes, continent, coordinates, capital, area, population |
| `src/tccData.ts` | 330 TCC territories across 12 regions with geo IDs and marker coordinates |
| `src/FavoritesTab.tsx` | ★ Bucket List aggregated tab component |
| `src/index.css` | Tailwind base + custom CSS |

#### Features

**Map Modes**
- **World mode** — 195 clickable countries (continent-color-coded), US States sub-layer, Canadian Provinces sub-layer, microstate dot markers (Vatican, Monaco, San Marino, etc.)
- **TCC mode** — 330 Travelers' Century Club territories across 12 regions. Country shapes tinted by region; non-geo entries (oceans, territories, microstates) rendered as colored dot markers. US territories split into "United States (Contiguous)", "Alaska", and "Hawaiian Islands" as separately-clickable polygons.

**Tracking**
- Visited / Bucket List toggle per destination across all categories
- Confirmations when moving a visited item to bucket list
- Independent state for Countries, US States, Canadian Provinces, and TCC entries

**Visit Details Panel**
- Date of first/last visit, times visited, free-text notes
- Up to 3 photo attachments (JPEG/PNG/WebP), client-side resized to 1200px max, stored as base64 in localStorage
- Lightbox modal with prev/next navigation, Esc/arrow key support, inline captions (max 120 chars)

**Short Notes**
- Independent of visit status — any destination (visited, bucket, or unmarked) can have a note
- Max 280 chars, auto-expanding textarea, auto-save on blur, "Saved ✓" flash
- 📝 indicator beside item name in all list tabs
- Notes total shown in legend when > 0

**Year Filter / Time Slider**
- Collapsible 📅 header toggle
- **Range mode** — dual sliders (from / to year)
- **Snapshot mode** — single slider with ▶ Play / ⏸ Pause auto-advance (1 year/sec)
- Destinations with no recorded year are always visible
- Bucket list unaffected; all list tab counts react to filter

**Statistics Dashboard** (📊 header button)
- Full-screen overlay with 5 sections:
  1. Headline tiles (Countries / TCC / US States / Provinces / Bucket total)
  2. Continent bar chart (using continent colors)
  3. Travel timeline (grouped by year with relative-volume bars + Undated section)
  4. Fun facts cards (hidden gracefully when data is insufficient)
  5. Shareable summary card with editable profile name; 📋 Copy as Image (html-to-image, clipboard + download fallback)
- Always reflects lifetime data, not year-filtered view

**Import / Export**
- CSV export of all visited destinations
- Excel (.xlsx) import with downloadable template
- Validates and maps rows to correct category

**Share URL**
- Encodes visited + bucket sets (including TCC) into a compressed URL hash
- Read-only mode: all mutation controls hidden, share URL survives page reload
- Notes included in payload when total URL length ≤ 6000 chars; otherwise omitted with notice
- Photos intentionally excluded from share payload

**Search**
- Autocomplete search bar across all categories
- Fly-to behavior (zoom + pan) on select
- Placeholder: "Search countries, states, provinces…"

**UI / UX**
- Zoom controls (+/−/Reset) with panning
- Tooltip on hover
- Progress counters + progress bars for Countries, States, Provinces, and TCC
- TCC milestone banner at 100 visited (membership threshold)
- Toast notifications
- Bucket List tab with purple "TCC" badge for TCC entries; clicking navigates to TCC map mode

**Persistence**
- `localStorage` keys: `wm_visited_*`, `wm_bucket_*`, `wm_details_*`, `wm_year_filter`, `wm_map_mode`, `wm_tcc_visited`, `wm_tcc_bucket`, `wm_details_tcc`, `wm_profile_name`, `photos:<category>:<id>`, `shortnote:<category>:<id>`
- Backend sync via `GET /api/map-data` and `PUT /api/map-data` (authenticated users)

---

### `artifacts/api-server` — Backend (`@workspace/api-server`)

**Stack:** Express 5, TypeScript, Clerk Express SDK, Drizzle ORM, PostgreSQL, Pino (logging)

**Entry point:** `src/index.ts` → `src/app.ts`

#### Key Source Files

| File | Purpose |
|---|---|
| `src/app.ts` | Express app setup: Clerk middleware, JSON parsing, route mounting |
| `src/index.ts` | Server startup, port binding |
| `src/routes/index.ts` | Route registration |
| `src/routes/health.ts` | `GET /api/healthz` — health check |
| `src/routes/map-data.ts` | `GET /api/map-data` + `PUT /api/map-data` — user data persistence |
| `src/middlewares/clerkProxyMiddleware.ts` | Clerk proxy header forwarding |
| `src/lib/logger.ts` | Pino logger singleton |

#### API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/healthz` | None | Returns `{ status: "ok" }` |
| `GET` | `/api/map-data` | Clerk JWT | Load the calling user's travel map data |
| `PUT` | `/api/map-data` | Clerk JWT | Upsert the calling user's travel map data |

---

## Shared Libraries

### `lib/api-spec` — OpenAPI Contract (`@workspace/api-spec`)

Single source of truth for all API contracts. Written in `openapi.yaml`.

- **Codegen command:** `pnpm --filter @workspace/api-spec run codegen`
- Generates React Query hooks → `lib/api-client-react/src/generated/`
- Generates Zod schemas → `lib/api-zod/src/generated/`
- Do **not** change `info.title` — it controls generated filenames

---

### `lib/api-client-react` — Frontend API Client (`@workspace/api-client-react`)

Auto-generated by Orval from the OpenAPI spec.

| File | Purpose |
|---|---|
| `src/generated/api.ts` | React Query hooks (`useGetMapData`, `useSaveMapData`, etc.) |
| `src/generated/api.schemas.ts` | TypeScript types matching OpenAPI schemas |
| `src/custom-fetch.ts` | Shared fetch wrapper (handles base URL, auth headers) |
| `src/index.ts` | Barrel export |

**Import in frontend:** `import { useGetMapData } from "@workspace/api-client-react"`

---

### `lib/api-zod` — Zod Validation Schemas (`@workspace/api-zod`)

Auto-generated by Orval. Used by the API server to validate request/response bodies.

Key generated schemas: `MapDataPayloadSchema`, `MapDataEnvelopeSchema`, `SaveMapDataResponseSchema`, `ErrorEnvelopeSchema`

---

### `lib/db` — Database Layer (`@workspace/db`)

**Stack:** Drizzle ORM + `pg` (PostgreSQL)

| File | Purpose |
|---|---|
| `src/schema/user_map_data.ts` | `user_map_data` table schema |
| `src/index.ts` | Drizzle client export |
| `drizzle.config.ts` | Drizzle Kit config for migrations |

#### Schema: `user_map_data`

| Column | Type | Notes |
|---|---|---|
| `user_id` | `varchar` | Primary key — Clerk user ID |
| `data` | `jsonb` | Full `MapDataPayload` blob stored as JSON |
| `updated_at` | `timestamp with time zone` | Auto-updated on every write |

**Migration command:** `pnpm --filter @workspace/db run push`

---

## Authentication

**Provider:** Clerk (Replit-managed tenant)

- Frontend: `@clerk/react` — `ClerkProvider`, `useAuth`, `SignIn` component, `useSignUp()` future API
- Backend: `@clerk/express` — `clerkMiddleware()`, `getAuth(req)`
- Session secret stored in `SESSION_SECRET` environment variable
- Publishable key: `VITE_CLERK_PUBLISHABLE_KEY` (frontend) / `CLERK_PUBLISHABLE_KEY` (backend)
- Secret key: `CLERK_SECRET_KEY` (backend only)

---

## Routing & Proxy

All traffic is routed through a shared reverse proxy by path prefix:

| Path prefix | Service | Artifact |
|---|---|---|
| `/` | Vite dev server (React app) | `world-map` |
| `/api` | Express server | `api-server` |
| `/__mockup` | Mockup sandbox Vite server | `mockup-sandbox` |

Paths are **not rewritten** — services handle their full base path.

---

## Key Constants (Frontend)

| Constant | Value | Description |
|---|---|---|
| `BUCKET_LIST_COLOR` | `#a37c1a` | Gold fill for bucket list map |
| `BUCKET_LIST_STROKE` | `#fbbf24` | Amber dashed border for bucket list |
| `TCC_TOTAL` | `330` | Total TCC territory count |
| `TCC_MEMBERSHIP_THRESHOLD` | `100` | Visited count for TCC membership banner |
| `SHARE_URL_BUDGET` | `6000` chars | Max share URL length before notes are omitted |

---

## Development Commands

```bash
# Full typecheck (all packages)
pnpm run typecheck

# Full build (typecheck + compile)
pnpm run build

# Regenerate API hooks + Zod schemas from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Push DB schema changes to dev database
pnpm --filter @workspace/db run push

# Typecheck a single artifact
pnpm --filter @workspace/world-map run typecheck
pnpm --filter @workspace/api-server run typecheck
```

---

## Environment Variables / Secrets

| Variable | Used by | Description |
|---|---|---|
| `CLERK_PUBLISHABLE_KEY` | `api-server` | Clerk publishable key (server-side) |
| `CLERK_SECRET_KEY` | `api-server` | Clerk secret key |
| `VITE_CLERK_PUBLISHABLE_KEY` | `world-map` | Clerk publishable key (frontend Vite env) |
| `SESSION_SECRET` | `api-server` | Express session secret |
| `PORT` | Both | Injected by workflow; do not hardcode |
| `BASE_PATH` | Both | Injected by workflow; used for URL prefixing |
| `DATABASE_URL` | `db` | PostgreSQL connection string (Replit-managed) |
