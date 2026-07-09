---
name: Replit Auth to Clerk migration
description: Notes on replacing Replit Auth with Clerk in a pnpm-workspace artifact when the user wants in-site accounts instead of Replit SSO.
---

Replacing Replit Auth with Clerk is a manual removal-and-rebuild, not a migration — old Replit-Auth user rows/sessions do not carry over into Clerk (different identity system), and users must re-register.

**Why:** the clerk-auth skill explicitly states automated migration from Replit Auth is unsupported. Any referenced "web-migration.md" migration doc does not exist.

**How to apply:**
- Get explicit user sign-off that existing accounts will be lost before starting.
- Drop the old `users`/`sessions` tables (Replit Auth specific) entirely — Clerk manages identity remotely, so app tables should key on Clerk's `userId` string with no local FK to a users table.
- Remove all Replit-Auth-specific packages/files (`@workspace/replit-auth-web` lib, `openid-client`, `cookie-parser` if only used by old auth, auth routes/middleware) and follow the clerk-auth skill's canonical wiring verbatim (proxy middleware, `clerkMiddleware`, `publishableKeyFromHost`, wouter sign-in/up routes) rather than improvising.
- Tailwind v4 apps need `@layer theme, base, clerk, components, utilities;` plus `@import '@clerk/themes/shadcn.css'` and `tailwindcss({ optimize: false })` in vite config, or Clerk UI breaks in production builds only (looks fine in dev).
