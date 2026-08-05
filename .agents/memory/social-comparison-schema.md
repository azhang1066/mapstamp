---
name: Social comparison schema
description: user_profiles and user_connections tables, authorization helper, username generation, and frontend hook location for the username prompt.
---

## Tables
- `user_profiles` — userId (PK), username (lowercase, unique via expression index on `lower(username)`), displayName, usernameSet boolean, createdAt
- `user_connections` — id (uuid PK), requesterId, addresseeId, status ('pending'|'accepted'|'declined'), createdAt, respondedAt; unique on (requesterId, addresseeId)

## Username rules
- Always stored lowercase; 3–30 chars; pattern `^[a-z0-9_]{3,30}$`
- Reserved words blocked (see `artifacts/api-server/src/lib/username.ts`)
- Auto-generated on first API hit if no profile exists yet (`GET /api/profile/me` self-provisions)
- `usernameSet = false` = auto-generated placeholder; `true` = user explicitly chose it

## Auth helper
`requireAcceptedConnection(callerId, otherUserId)` in `artifacts/api-server/src/lib/requireConnection.ts` — throws `ForbiddenError` if no accepted connection exists in either direction. Used by compare and leaderboard routes.

## Username prompt hook location (not yet implemented)
In `AppWithSync` in `artifacts/world-map/src/AuthRoot.tsx`, after the existing `useEffect` that loads map-data and runs photo migration — call `GET /api/profile/me`, check `usernameSet`, set a `needsUsername` state flag, render a modal overlay above `<App>`.

## Backfill
Script at `lib/db/src/scripts/backfill-profiles.ts`, run via `pnpm --filter @workspace/db run backfill:profiles`. All 3 existing users provisioned with `usernameSet = false`.

## New routes
profile.ts, users.ts, connections.ts, compare.ts, leaderboard.ts — all mounted in `artifacts/api-server/src/routes/index.ts`.

**Why:** Mutual-connection model (both must accept) prevents data leakage. Single `requireAcceptedConnection` helper avoids duplicated auth logic across compare/leaderboard routes.
