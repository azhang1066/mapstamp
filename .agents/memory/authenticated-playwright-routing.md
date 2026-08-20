---
name: Authenticated Playwright routing
description: Routing requirement for World Map browser tests that exercise Clerk-authenticated API requests.
---

Authenticated World Map browser tests run against a standalone Vite server that proxies `/api` to a separately launched local API server; they do not need the managed artifact preview router.

**Why:** routing API calls through Vite keeps Clerk cookies and browser-origin requests intact while making the browser suite portable to local development and CI. Playwright’s out-of-page request context does not reliably carry a newly created Clerk session.

**How to apply:** start the API service alongside Vite in Playwright, configure Vite’s `/api` proxy target for that API port, and seed cloud fixtures with in-page `fetch` so the browser’s real Clerk credentials are used. The authenticated runner must own isolated ports rather than reusing an artifact Vite process, because its normal preview configuration has no test proxy.