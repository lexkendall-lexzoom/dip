# DipDays Review Evidence Agent (Tier 3, Launch Scope)

The Review Evidence Agent ingests third-party **Google reviews** and converts them into structured sentiment evidence.

## Source hierarchy placement

- **Tier 1**: discovery (OSM, curated seeds, manual)
- **Tier 2**: factual enrichment (Google Places, official sites)
- **Tier 3**: review evidence / sentiment (**this agent**)

Review evidence is **not canonical truth** and **not discovery**. It is additive evidence that can later inform ranking adjustments.

## Launch scope (intentionally narrow)

v1 is constrained to reduce runtime risk and keep evidence quality inspectable:

- Source: **Google reviews only**
- Cities: **new-york, san-francisco, los-angeles, miami, chicago**
- Selection: **top 10 venues per city**
- Global cap: **50 venues total**

## Deterministic venue selection

Selection order is deterministic and inspectable:

1. `--venue <slug>`: process exactly that venue.
2. `--city <slug>`: process only that city (must be one of the five launch cities), capped to top 10.
3. No `--city`: process all five launch cities, max 10 each, hard cap 50.

"Top" venues are selected using existing score artifacts in `data/processed/scores/*.score.json` (`overall` descending). If scores are missing, fallback order is stable name/slug sorting.

## Script

- `scripts/ingestion/reviewEvidenceAgent.ts`

## Inputs

- Canonical venues from `data/processed/venues/*.canonical.json`
- Provider source:
  - fixture file (`--fixture`) for deterministic offline runs (first-class)
  - live Google-review fetch via Outscraper (`OUTSCRAPER_API_KEY`) when available

## Output

Per venue artifact:

- `data/processed/evidence/<venue-slug>.reviews.evidence.json`

Shape:

- `venue_id`
- `source`
- `review_count`
- `signals[]` with `signal`, `sentiment` (-1..1), `confidence` (0..1), `evidence`

## Controlled signal vocabulary

- `sauna_quality`
- `cold_plunge_quality`
- `cold_plunge_access`
- `steam_room_quality`
- `thermal_circuit_quality`
- `ritual_quality`
- `cleanliness`
- `facility_condition`
- `crowd_density`
- `staff_friendliness`
- `design_ambience`
- `value_perception`

## Aggregation behavior

- Dedupes identical/near-identical review text
- Batches reviews into chunks
- Extracts chunk-level signals in deterministic structure
- Aggregates with confidence weighting and review-count dampening
- Prevents tiny review counts from yielding high confidence

## Fixture-based examples

Single-venue run:

```bash
node scripts/ingestion/reviewEvidenceAgent.ts \
  --venue othership-flatiron-new-york \
  --fixture test/fixtures/reviews/othership-google.json
```

City-batch run (launch-scoped top-10 selection):

```bash
node scripts/ingestion/reviewEvidenceAgent.ts \
  --city new-york \
  --fixture test/fixtures/reviews/new-york-city-batch.json
```

## Live run

```bash
export OUTSCRAPER_API_KEY="..."
node scripts/ingestion/reviewEvidenceAgent.ts --city new-york
```

## Evidence-stage wiring

`runCityPipeline.ts` runs review evidence after base evidence extraction only when:

- `REVIEW_FIXTURE_PATH` or `OUTSCRAPER_API_KEY` is set, and
- the pipeline city is in the five-city launch scope.

Otherwise review evidence is skipped and existing evidence/scoring flow is unchanged.

## Why this scope now

This launch scope lets DipDays safely ship sentiment evidence with deterministic behavior, while keeping runtime and provider variability bounded. It prepares the platform for future sentiment-informed ranking adjustments without changing DipScore formulas in this pass.
