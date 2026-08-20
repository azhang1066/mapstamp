---
name: Legacy photo ownership
description: Privacy boundary for migrating photo data retained in browser storage.
---

Legacy browser photo keys must be bound to the first authenticated account that
claims them. If a later authenticated account differs, discard the legacy keys
before any upload begins; an in-memory user reference alone is insufficient.

**Why:** Clerk account transitions can reload the application or replace a
session without a committed signed-out render, resetting component state while
browser storage remains. Uploading ownerless keys after that transition assigns
the previous traveler’s photos to the new traveler.

**How to apply:** Keep a lightweight persisted owner marker alongside legacy
photo keys. On authenticated hydration, compare it to the current user before
running migration; preserve keys only for the initial claim or same-owner
return, and remove them for a different owner. Run migration through a
per-user abort signal and serialize a new owner's migration behind cancellation
of the previous one; re-check ownership before every upload and before deleting
the local key.