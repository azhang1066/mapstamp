# World Map Travel Tracker

## 1. Overview

World Map Travel Tracker is a full-stack travel-recording application. It lets people mark countries, U.S. states, Canadian provinces, and Travelers' Century Club (TCC) territories as visited or bucket-listed. Signed-in users can record visit years, visit counts, notes, and private photos; explore TCC progress; import/export travel data; share a read-only map link; and connect with other users.

The primary flow is:

1. A visitor can use the map locally as a guest, or sign in with Clerk and choose a username on first use.
2. They interact with the World or TCC map, or the destination lists, to record travel.
3. The browser saves interaction state locally and, when signed in, synchronizes it to the API.
4. They can filter the map by a year, review statistics, manage a profile/favorites, upload photos, or use Connections to find other users and manage requests.

Shared map links are server-stored, read-only snapshots intended for viewing rather than collaboration. The share page has preview metadata for social platforms, while the interactive map loads the snapshot from the API.

## 2. Tech Stack

| Area | Technology in use |
|---|---|
| Language | TypeScript/TSX, with a small JavaScript esbuild script |
| Monorepo | pnpm workspaces |
| Frontend | React 19, Vite 7, Tailwind CSS 4 |
| Map rendering | `react-simple-maps`, TopoJSON, D3 interpolation/scale |
| Client state/data fetching | React state, browser `localStorage`, TanStack React Query |
| Authentication | Clerk (`@clerk/react`, `@clerk/express`) |
| Backend | Express 5, Node.js 24, esbuild |
| Database | PostgreSQL, accessed through Drizzle ORM and `pg` |
| API contract/codegen | OpenAPI, Orval, generated React Query client, generated Zod package |
| Uploads | Multer; Replit Object Storage through Google Cloud Storage libraries and the Replit sidecar |
| Other notable UI/data tools | SheetJS/XLSX (loaded on demand), `html-to-image`, Recharts, Wouter, Radix UI components, React Hook Form, Framer Motion, Lucide |
| Testing | Vitest and Supertest for the API; Playwright browser tests for map persistence and connection flows |

### Hosting and deployment

The Replit configuration uses an application router with an autoscale deployment target.

- The `world-map` artifact is a static web artifact, served at `/`; production output is `artifacts/world-map/dist/public` with SPA rewrites for the main page and sign-in/sign-up.
- The `api-server` artifact is a Node/Express service, served at `/api` and `/s`; it is built with esbuild and runs `dist/index.mjs`.
- The `mockup-sandbox` artifact is a development/design preview service at `/__mockup`; no production service is configured for it.

No production hostname or external hosting provider is specified in the repository. That is managed by the Replit deployment environment.

## 3. Architecture

### Repository layout

```text
artifacts/
  world-map/          React/Vite application
  api-server/         Express API
  mockup-sandbox/     Isolated component-preview environment
lib/
  api-spec/           OpenAPI source and Orval configuration
  api-client-react/   Generated React Query API hooks and custom fetch client
  api-zod/            Generated Zod schemas and exported API types
  db/                 Drizzle client, schemas, and database scripts
scripts/
  post-merge.sh       Post-merge reconciliation script
PROJECT.md            This project and technical-design overview
```

### Frontend

The frontend starts at `artifacts/world-map/src/main.tsx`, which creates the React root, configures React Query, and configures the generated API client base URL. `AuthRoot.tsx` wraps Clerk authentication and Wouter routes, loads authenticated user data, and controls onboarding/profile modals. `App.tsx` contains the main map UI, destination state, map/list interactions, year filtering, share/import/export, statistics, and details panels.

The main map has two modes:

- **World**: countries, U.S. states, Canadian provinces, and microstate markers.
- **TCC**: 330 Travelers' Century Club entries across 12 regions. Entries use country shapes where available, marker dots for other entries, and a separate U.S. states layer for contiguous U.S., Alaska, and Hawaiian Islands.

`ConnectionsPanel.tsx` is loaded on demand and provides user search, pending requests, and accepted-connection management. `UsernameOnboardingModal.tsx` blocks initial access until a user selects a valid username. `FavoritesTab.tsx` stores up to five favorite country/TCC destinations locally. The web artifact also includes static SEO metadata, a sitemap, and robots instructions.

### Compare Maps

Signed-in travelers open **Compare** in the main toolbar and choose one accepted connection, or use **Compare maps** on an accepted connection card. Wouter serves the lazy-loaded view at `/compare/:username`; the web artifact includes a production rewrite for direct navigation to that route.

The view resolves the username against accepted connections, then calls the existing generated `useCompareWithUser` hook. A single map overlays both travelers using solid, dotted, and hatched styles; outlines distinguish bucket-list overlap and places one traveler visited on the other's bucket list. World and TCC modes reuse the main map's geography URLs, microstate markers, and destination tables through `mapGeography.ts`, including the TCC U.S. state layer.

Controls include visibility and opacity per traveler, both-only and bucket-list toggles, swapping perspective, and a year filter. Hover/focus and the read-only destination panel show each traveler's status, first/latest year, and visit count. The separately lazy-loaded statistics panel is a desktop sidebar or mobile bottom sheet with overlaps, bucket-list recommendations, total visits, most-visited destinations, Jaccard similarity, a TCC regional chart, and a timeline. Image export includes the map, legend, and both usernames; there is no public comparison sharing.

**Year semantics:** comparison filtering is cumulative, including destinations with a first known visit on or before the selected year. It uses the first visit year, falling back to the latest when no first year is recorded. Undated visits appear only with the filter off. Buckets are not year-filtered. Visit counts are lifetime counts for the selected destinations, not counts of trips taken by that year. The timeline uses the same first-known-year rule.

**Privacy boundary:** the compare route is outside `AppWithSync`, so it never mounts the editable map, hydrates its browser storage, or triggers a map-data save. Pending edits are saved by the main map before navigating away. Friend data is kept in account-scoped React Query cache, not `localStorage`; the cache is discarded when the view unmounts, and the view is remounted on an account change. Connections and comparison data refetch on mount/focus and every 30 seconds while active. Authorization or fetch failures stop displaying the comparison. No friend notes, photos, favorites, storage keys, or JSONB map payload are returned or rendered.

### Backend

`artifacts/api-server/src/index.ts` starts the Express server. `src/app.ts` configures Pino HTTP logging, Clerk middleware/proxying, credentialed CORS, JSON/url-encoded parsing, and mounts all routes beneath `/api`.

API route modules use Clerk's `getAuth(req)` to obtain the caller where required. The server communicates with PostgreSQL through the shared `@workspace/db` package. Photo routes store object bytes in private Object Storage and metadata in PostgreSQL.

### Client/server communication

- The frontend uses same-origin `/api/...` requests. Generated API hooks use `@workspace/api-client-react`; some map/profile/photo synchronization is implemented with direct `fetch`.
- Authenticated travel data is local-first: the map writes browser state immediately, then sends a debounced `PUT /api/map-data` after relevant changes.
- On authenticated startup, `AuthRoot` loads `/api/map-data` and `/api/profile/me`, handles legacy local photo migration, and blocks the editable map until cloud hydration succeeds. Account changes clear account-scoped local travel data to prevent cross-user leakage.
- Sharing creates a persisted snapshot with `POST /api/shares`; `/s/:id` returns crawler-readable HTML and an SVG preview, then hands off to the React app, which fetches `/api/shares/:id`. The URL contains only an opaque share ID; the snapshot may include travel notes but never photos, visit years, or private profile data.
- Clerk provides browser identity; the API validates the Clerk session for protected routes.
- There are no WebSocket or background-worker implementations in the application source.

### Conventions

- The OpenAPI file in `lib/api-spec/openapi.yaml` is the intended API contract source. Run code generation after changing it.
- API-client files under `lib/api-client-react/src/generated/` are generated and should not be edited manually.
- The database package uses TypeScript project references/composite declarations. Rebuild it after schema changes so downstream packages see updated types.
- User destination data uses normalized database rows for countries, states, provinces, and TCC entries. Stadium/park data remains in the JSONB map-data payload.

## 4. Data Model

PostgreSQL is accessed through Drizzle. The schema declares no database foreign keys; user ownership and table relationships are enforced in application logic using Clerk user IDs.

| Table | Key fields | Purpose |
|---|---|---|
| `user_map_data` | `user_id` (PK), `data` JSONB, `updated_at` | Stores non-normalized map payload fields, including stadium/park data, notes, and profile name. |
| `user_destinations` | `user_id`, `category`, `destination_id` (unique together), `is_visited`, `is_bucket`, visit years/count, `updated_at` | Source of truth for country, U.S. state, Canadian province, and TCC visited/bucket status. Categories are stored as strings. |
| `user_photos` | UUID `id`, `user_id`, category, destination ID, storage key, caption, position, `created_at` | Metadata for up to three private photos per destination. Photo bytes are not stored in PostgreSQL. |
| `user_profiles` | `user_id` (PK), `username`, `display_name`, `username_set`, `created_at` | User profile and username-onboarding state. Username is indexed uniquely, including a case-insensitive expression index. |
| `user_connections` | UUID `id`, requester/addressee IDs, `status`, timestamps | Directed connection requests. Status is stored as `pending`, `accepted`, or `declined`; requester/addressee pairs are unique. |
| `map_shares` | Opaque `id` (PK), optional owner ID, `snapshot` JSONB, visited/bucket counts, creation time | Stable public read-only snapshots and preview totals. |

`PUT /api/map-data` replaces the caller's normalized `user_destinations` rows within a transaction and upserts the caller's JSONB map-data record. `GET /api/map-data` assembles both storage forms into the map-data response.

The database configuration is push-based (`drizzle-kit push`); no SQL migration directory is present in this repository.

## 5. API / Routes

All routes below are mounted below `/api`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/healthz` | No | Health check returning `{ status: "ok" }`. |
| `GET` | `/map-data` | Clerk | Loads the caller's travel data. |
| `PUT` | `/map-data` | Clerk | Replaces/upserts the caller's travel data. |
| `GET` | `/photos?category=&destinationId=` | Clerk | Lists the caller's photos for one destination. |
| `POST` | `/photos` | Clerk | Uploads a JPEG, PNG, or WebP photo and persists metadata. The route expects multipart form data. |
| `PATCH` | `/photos/:id` | Clerk, owner | Updates a photo caption. |
| `DELETE` | `/photos/:id` | Clerk, owner | Deletes a photo record and attempts to delete its stored object. |
| `GET` | `/photos/:id/content` | Clerk, owner | Streams a private photo's content. |
| `GET` | `/profile/me` | Clerk | Returns or provisions the caller's profile and generated username. |
| `PUT` | `/profile/username` | Clerk | Validates and sets the caller's username; returns conflict for an existing username. |
| `GET` | `/users/search?q=` | Clerk | Prefix-searches usernames and display names, case-insensitively; excludes the caller and returns no travel data. |
| `GET` | `/connections` | Clerk | Lists the caller's incoming/outgoing pending and accepted connections with profile information. |
| `POST` | `/connections/request/:userId` | Clerk | Creates a connection request. Self-requests, missing users, and duplicates are rejected. |
| `POST` | `/connections/:id/accept` | Clerk, addressee | Accepts a pending request. |
| `POST` | `/connections/:id/decline` | Clerk, addressee | Declines a pending request. |
| `DELETE` | `/connections/:id` | Clerk, connection party | Removes a connection/request. |
| `GET` | `/compare/:otherUserId` | Clerk, accepted connection | Returns allowlisted profile/destination comparison data with `Cache-Control: no-store`. Non-connections, pending requests, and declined requests receive 403. |
| `GET` | `/leaderboard` | Clerk | Ranks the caller and accepted connections by normalized visited-destination counts. |
| `GET` | `/stats/aggregate?category=&limit=` | No | Returns public aggregate counts for a normalized destination category. |
| `GET` | `/stats/destination/:category/:id` | No | Returns public visited/bucket counts and percentages for one destination; 404 if no rows exist. |
| `POST` | `/shares` | No | Creates a stable, public map snapshot; stores an owner ID if signed in. |
| `GET` | `/shares/:id` | No | Returns the public snapshot and summary counts for the interactive map. |

Two public routes are served outside `/api`: `GET /s/:id` returns share HTML with Open Graph metadata and a browser handoff to the map, and `GET /s/:id/preview.svg` returns a generated visual summary. Shared pages are marked `noindex, nofollow`; their preview metadata exposes only summary counts, not notes.

The OpenAPI contract is `lib/api-spec/openapi.yaml`. Orval generates React Query hooks into `lib/api-client-react/src/generated/` and Zod output into `lib/api-zod/src/generated/`.

The compare response retains its existing envelope:

```text
{
  me:    { userId, username, displayName, destinations: DestinationRow[] },
  other: { userId, username, displayName, destinations: DestinationRow[] }
}

DestinationRow = {
  userId, category, destinationId, isVisited, isBucket,
  firstVisitedYear: number | null,
  lastVisitedYear: number | null,
  timesVisited: number | null
}
```

Only normalized `user_destinations` fields are selected for destination rows. Both sides have the same explicit field allowlist and response validation; neither side includes `user_map_data`, notes, or photo metadata. No database schema change was required for comparison.

## 6. Environment & Configuration

Never commit values for the following variables or secrets.

| Variable | Used by | Notes |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | World Map | Required by the browser Clerk provider. The app throws at startup when no usable key is available. |
| `VITE_CLERK_PROXY_URL` | World Map | Optional Clerk proxy URL. |
| `CLERK_PUBLISHABLE_KEY` | API server | Clerk configuration. |
| `CLERK_SECRET_KEY` | API server | Clerk server credential and Clerk proxy support. |
| `DATABASE_URL` | `@workspace/db` / API server | Required PostgreSQL connection string. |
| `PORT` | World Map and API server | Injected by Replit service configuration; both services expect a port. |
| `BASE_PATH` | World Map | Path-based artifact base URL; configured as `/` for the web artifact. |
| `API_PROXY_TARGET` | World Map dev server | Optional local API target used by isolated browser tests; normal artifact routing handles `/api` and `/s`. |
| `PRIVATE_OBJECT_DIR` | API server | Required Object Storage directory for private photo objects. |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Object storage helper | Comma-separated public Object Storage search paths; required only by helper methods that search public objects. |
| `NODE_ENV` | API server | Set to `production` in the API artifact's production configuration. |

External services visible in code:

- **Clerk** for authentication and a proxied Clerk frontend API route.
- **PostgreSQL** through Replit-managed connection configuration.
- **Replit Object Storage / Google Cloud Storage client** for private photos. The server obtains Replit credentials and signed URLs through the local Replit sidecar.

## 7. Setup & Running Locally

This project expects Node.js 24 and pnpm. The root `preinstall` script rejects non-pnpm package managers.

```bash
# Install workspace dependencies
pnpm install

# Start the two services through their configured Replit artifact workflows:
# artifacts/world-map: web
# artifacts/api-server: API Server
```

For a functional authenticated environment, configure the required Clerk, database, and Object Storage variables listed above. The API requires `DATABASE_URL`; the frontend requires a Clerk publishable key. Replit workflows inject the web service's `PORT` and `BASE_PATH`; running its `dev` or `build` command manually requires those variables too.

Useful commands:

```bash
# Typecheck the workspace
pnpm run typecheck

# Build the workspace
pnpm run build

# Build or typecheck individual artifacts
pnpm --filter @workspace/world-map run build
pnpm --filter @workspace/world-map run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run typecheck

# Run API integration tests
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run test:watch

# Run browser tests (requires the test environment and Clerk test setup)
pnpm --filter @workspace/world-map run test:e2e

# Check that Connections remains split into a lazy-loaded build chunk
pnpm --filter @workspace/world-map run test:connections-build

# Check pure comparison calculations (no network or database)
pnpm --filter @workspace/world-map exec tsx --test src/compare/compareModel.test.ts

# Run the focused two-user comparison browser regression
pnpm --filter @workspace/world-map exec playwright test compare-maps.authenticated.spec.ts --project=authenticated

# Regenerate API client and Zod output after OpenAPI changes
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/api-client-react exec tsc -b

# Apply the current Drizzle schema to the development database
pnpm --filter @workspace/db run push
```

The configured Replit validation workflow runs:

```bash
pnpm --filter @workspace/api-server run test
```

There is no root `dev` script; application services run through their artifact workflows. The post-merge script installs dependencies, builds the database package, and pushes the current development schema.

## 8. Design Boundaries and Test Coverage

- Shared links are public snapshots. Anyone with the link can view the included destinations and optional notes; photos, visit details, years, favorites, and profile name are excluded. Sharing creates a stored snapshot rather than a live view of later edits.
- Map data writes replace the caller's normalized destination rows in a transaction, so clients must send the complete visited/bucket state. Other legacy fields remain in JSONB.
- Browser tests cover public and authenticated map-mode persistence, cloud hydration/account isolation, and connection request lifecycle; API integration tests cover map-data and connection authorization/round trips. This is not a claim of full UI coverage for profile or photos.
- Compare-specific coverage includes API authorization/privacy, both users' visit years/counts, pure year/overlap/statistics calculations, and a two-user browser flow through the overlay, controls, details, World/TCC switching, forbidden state, and unchanged local map storage.
- TCC source data identifies itself as the official list as of January 2022; verify currency before presenting it as a current external standard.