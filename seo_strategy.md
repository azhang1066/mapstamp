# SEO Strategy

## In scope
- Public-facing World Map web application (`artifacts/world-map`)
- Public API discovery surfaces when source makes them public (`artifacts/api-server`)

## Out of scope
- Authenticated travel dashboards, account-specific maps, social features, and other private application views
- Design sandbox (`artifacts/mockup-sandbox`)

## Target audience
- Travelers tracking visited countries and territories; unknown beyond source-visible product context.

## Primary keywords
- Unknown — source-visible product language includes world map, visited countries, travel tracking, and Travelers' Century Club progress.

## Rendering and crawler assumptions
- The World Map production service is a Vite static SPA with a catch-all rewrite to `index.html`.
- Public routes should make essential metadata and content available in initial HTML to search, social, and AI crawlers.

## Dismissed categories
- (None yet)
