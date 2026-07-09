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

## Custom sign-up/sign-in forms (beyond prebuilt `<SignUp/>`/`<SignIn/>`)

Clerk's prebuilt `<SignUp/>`/`<SignIn/>` components only support the `appearance` styling API — you cannot inject extra custom fields (e.g. a "Confirm Password" field) into them. To add custom fields, you must build the form yourself with the headless `useSignUp()` / `useSignIn()` hooks and `useClerk()` for `setActive`.

**Why:** the installed `@clerk/react` (actual major version can differ wildly from what package.json declares — check `node_modules/.pnpm` for the real resolved version) exposes a newer "future" signals-based API on the object returned by `useSignUp()`/`useSignIn()`, not the older promise-chaining API many Clerk docs/examples show.

**How to apply:**
- Check the actual resolved method names on `SignUpFutureResource`/`SignInFutureResource` in `node_modules/.pnpm/@clerk+shared@*/node_modules/@clerk/shared/dist/types/signUpFuture.d.mts` (or `signInFuture.d.mts`) before writing hook calls — don't assume `signUp.create()` + `signUp.prepareEmailAddressVerification()` + `signUp.attemptEmailAddressVerification()` (legacy API) will typecheck.
- The future API shape used in this repo: `signUp.password({ emailAddress, password })` to create the attempt, `signUp.verifications.sendEmailCode()` / `signUp.verifications.verifyEmailCode({ code })` for email verification, `signUp.sso({ strategy, redirectUrl, redirectCallbackUrl })` for OAuth, and `signUp.finalize({ navigate })` to activate the session once `signUp.status === "complete"`. Each of these resolves to `{ error }` (no throw) rather than throwing on failure.
- OAuth (e.g. Google) still needs a dedicated `/sign-up/sso-callback` route rendering `<AuthenticateWithRedirectCallback signUpForceRedirectUrl=... signInForceRedirectUrl=... />`, registered in the router BEFORE the catch-all `/sign-up/*?` route (route match order matters with wouter).
- A `<div id="clerk-captcha" />` in the form is required for Clerk's bot protection on custom (non-prebuilt) sign-up flows.
