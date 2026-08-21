---
name: Public share privacy
description: Rules for stable public map share pages, crawler metadata, and opaque snapshot handoff.
---

Public share URLs are capability-style links. Keep the URL and the crawler HTML limited to an opaque share ID plus non-sensitive summary metadata; load the actual immutable snapshot through the public API after the browser starts.

**Why:** Snapshot payloads can contain private notes and grow beyond browser or proxy URL limits. Serializing them into redirects, history, or HTML leaks data unnecessarily and makes valid large shares unreliable.

**How to apply:** Use the stable `/s/<id>` response for escaped, noindex social metadata and preview imagery. Its browser handoff must carry only the validated ID; the client then requests the public snapshot endpoint and restores the stable path. Count destinations within each category before summing so overlapping category identifiers do not undercount metadata.