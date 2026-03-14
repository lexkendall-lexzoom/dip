# DipDays Decap CMS Venue Schema Extension (Non-Destructive)

This pass extends the existing Decap CMS venue model without removing or renaming existing collections or fields.

## What changed

- Existing venue collections (`venues_*`) are preserved.
- Existing venue fields remain intact.
- New optional structured fields were added under `venue` in `admin/config.yml` for:
  - city assignment (`city_slug`) independent from folder path
  - lifecycle status (`status`)
  - taxonomy (`primary_category`, `secondary_categories`, `bathing_style`, `amenities`)
  - location/commercial links (`address`, `website`, `booking_url`)
  - richer descriptions (`description_short`, `description_long`)
  - media (`gallery` in addition to existing `gallery_images`)
  - sourcing and QA (`source_links`, `source_confidence`, `source_last_verified_at`, `needs_review`)
  - scoring/seo extensions (`dip_score`, `seo_title`, `seo_description`, `price_range`)

## Backward compatibility guarantees

- Existing URLs remain unchanged because routing still uses folder-based `citySlug` + existing `venue.slug` fallbacks.
- Existing city pages and venue pages continue to render if new fields are missing.
- Templates now use fallback chains for new metadata and content fields:
  - SEO title: `seo.title` → `venue.seo_title` → legacy default
  - SEO description: `seo.description` → `venue.seo_description` → `venue.description_short`
  - Website CTA: `venue.website_url` → `venue.website`
  - Body copy: `venue.review` → `venue.description_long`
  - Gallery: existing `gallery_images` → new `gallery`
  - Price: existing `price` → new `price_range`

## City field strategy

- `venue.city` remains as-is for backward compatibility.
- New `venue.city_slug` introduces an explicit controlled assignment field for scalable multi-city support.
- Build data now carries both:
  - `citySlug` (path/folder, keeps routing stable)
  - `assignedCitySlug` (new explicit city assignment for future directory generation)

## Controlled taxonomy setup

The CMS now supports controlled values for:

- `primary_category` and `secondary_categories`
- `bathing_style`
- `amenities`

These are optional and do not block editing/publishing legacy venue entries.

## Agent ingestion contract (normalized target)

Agents should normalize and write toward these venue keys when known:

- Identity/location:
  - `name`, `slug`, `city`, `city_slug`, `neighborhood`, `address`
- URLs:
  - `website` (or `website_url` for backward compatibility), `booking_url`
- Taxonomy:
  - `primary_category`, `secondary_categories[]`, `bathing_style`, `amenities[]`
- Operational:
  - `hours`, `price_range`
- Content/media:
  - `description_short`, `description_long`, `hero_image`, `gallery[]`
- Source quality:
  - `source_links[]`, `source_confidence` (0..1), `source_last_verified_at`, `needs_review`
- Editorial/scoring:
  - `dip_score`, `status`, `seo_title`, `seo_description`

### Normalization guidance for agents

- Normalize category/style/amenity synonyms into controlled values.
- Preserve evidence in `source_links` whenever possible.
- Set `source_confidence` based on source quality and field certainty.
- Set `needs_review: true` when extraction confidence is low or source signals conflict.
- Leave fields null/empty instead of guessing when uncertain.

## Suggested low-risk backfill plan

1. Start with no bulk migration; keep existing content untouched.
2. During normal editorial updates, populate new fields incrementally.
3. Optionally run a scripted backfill later to map known legacy values:
   - `website_url` → `website` (or keep dual-populated)
   - simple city mapping into `city_slug`
   - coarse taxonomy mapping from `best_for` / editorial labels
4. Keep `needs_review: true` on auto-filled records until verified.

This approach avoids risky schema resets and keeps Decap CMS + live templates stable while enabling future directory SEO pages.
