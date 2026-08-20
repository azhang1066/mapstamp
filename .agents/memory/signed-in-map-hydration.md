---
name: Signed-in map hydration
description: Cloud-authoritative progress rules for authenticated World Map travelers.
---

Authenticated travel progress must hydrate successfully before mounting any component that can synchronize browser state back to the map-data API.

**Why:** browser storage can belong to a previous account or reflect stale progress. Rendering the signed-in map before the GET completes lets its debounced write replace the current traveler’s cloud data.

**How to apply:** treat a successful map-data GET as a per-user gate. Clear only progress keys before applying the response, preserve local view preferences and legacy-photo migration data, and keep the map blocked with an explicit retry state if hydration fails.