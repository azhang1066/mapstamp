---
name: Authenticated Playwright routing
description: Routing requirement for World Map browser tests that exercise Clerk-authenticated API requests.
---

Authenticated World Map browser tests must run against the managed artifact preview URL, not the standalone Vite test server, because the preview router forwards `/api` requests to the API service.

**Why:** the standalone Vite server serves the frontend but returns 404 for the API routes, and Playwright’s out-of-page request context does not reliably carry the newly created Clerk session.

**How to apply:** point authenticated Playwright setup and test projects at the managed preview (or provide an equivalent API proxy), and seed cloud fixtures with in-page `fetch` so the browser’s real Clerk credentials are used.