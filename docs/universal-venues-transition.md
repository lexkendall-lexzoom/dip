# Universal Venues Transition Plan

## What was added

- New Decap CMS collection: **Venues** (`content/venues/_universal`).
- Existing city-scoped collections remain unchanged and operational.
- Eleventy venue loader now reads both legacy city folders and `_universal`.
- Rendering preference is additive and safe:
  1. Use universal venue record when a route key (`city_slug + slug`) matches.
  2. Fall back to legacy city-scoped record when no universal override exists.

## Coexistence model (non-destructive)

- Legacy venue files under `content/venues/<city>/` are still valid and still render.
- Universal records under `content/venues/_universal/` can be created immediately for new venues.
- During migration, both systems coexist.
- No existing URLs change; route shape remains `/<city-slug>/<venue-slug>/`.

## Editorial workflow now

1. Open **Venues** in Decap CMS.
2. Create/edit venue in one global workflow.
3. Assign city explicitly via `venue.city_slug` (and/or city name).
4. Publish as usual.

## Gradual backfill strategy

Use dry run first:

```bash
npm run venues:backfill:universal
```

Write missing universal records:

```bash
npm run venues:backfill:universal:write
```

This script copies legacy venue frontmatter into universal files and ensures `venue.slug` + `venue.city_slug` are present.

## What remains legacy for now

- City-specific Decap collections (`Venues · New York City`, etc.).
- Legacy venue storage directories (`content/venues/<city>/`).

## What can be deprecated later (after full backfill + validation)

- City-specific venue collections in Decap.
- Legacy city-scoped authoring flow.
- Compatibility fallback in Eleventy loader.

## Agent ingestion contract assumptions

Agents should write/update universal records with:

- `venue.name`
- `venue.slug`
- `venue.city` and `venue.city_slug`
- `venue.address`
- `venue.website` / `venue.website_url`
- `venue.booking_url`
- `venue.primary_category`
- `venue.bathing_style`
- `venue.amenities`
- `venue.hours`
- `venue.price_range`
- `venue.hero_image` + `venue.gallery`
- `venue.source_links`
- `venue.source_confidence`
- `venue.source_last_verified_at`
- `venue.needs_review`

These map directly to existing CMS fields and are backward-compatible with current templates.
