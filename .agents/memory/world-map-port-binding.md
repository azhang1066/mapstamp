---
name: World Map port binding
description: Preventing Vite's fallback-port behavior from breaking the artifact preview route.
---

The World Map Vite server must use strict port binding for both development and preview.

**Why:** When the artifact's assigned port is already occupied, Vite otherwise moves to the next free port. The Replit artifact proxy still targets the configured port, so the preview can serve a stale process or appear unavailable.

**How to apply:** Keep the Vite configuration bound to the injected `PORT` with strict-port behavior. If a restart reports a fallback port, clear the stale dev server and restart the managed artifact workflow rather than accepting the fallback.