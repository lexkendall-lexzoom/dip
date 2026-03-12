# DipDays Ranking Architecture (Phase 2)

## Why this refactor
DipDays now separates discovery, evidence, scoring, and publishing so the system behaves like a data platform, not a template-side heuristic pipeline.

## Data flow

## Raw → Canonical → Derived persistence flow

DipDays persists data in three explicit layers:

1. **Raw source snapshots** (`data/raw/*`)
   - Immutable provider snapshots from discovery/enrichment/review collection.
2. **Canonical venue records** (`data/processed/venues/*.canonical.json`)
   - Normalized venue truth with provenance (`discovered_from`, `enriched_from`, `review_sources`, `last_canonicalized_at`).
3. **Derived artifacts** (`data/processed/evidence`, `data/processed/scores`, `data/processed/pipeline`, rankings/QA)
   - Recomputable outputs used for ranking, QA, and reporting.

This keeps source-of-truth boundaries clear while allowing evidence and scoring artifacts to be regenerated safely.

## OSM-first discovery (new wiring)

City discovery now runs as:

1. `scripts/ingestion/osmDiscovery.ts` (required)
   - Uses city `bbox`/`bboxes` from `configs/cities/{city}.json` by default.
   - Supports `--tile`, `--bbox`, `--resume`, and `--dry`.
   - Writes raw Overpass payloads to `data/raw/osm/{city}/{tile}.json` and flattened deduped candidates to `data/processed/discovery/{city}.json`.
2. `scripts/ingestion/googleEnrich.ts` (optional)
   - Enriches missing website/phone/address via Google Places when `GOOGLE_PLACES_API_KEY` is present.
   - Writes `data/processed/discovery_enriched/{city}.json` and cache file.

Canonicalization consumes the enriched candidate set when present.

1. **Discovery Agent** (`scripts/ingestion/classifyVenue.ts`)
   - Reads raw venue input.
   - Produces two artifacts:
     - Canonical venue record: `data/processed/venues/{slug}.canonical.json`
     - Evidence records: `data/processed/evidence/{slug}.evidence.json`
   - Produces claims and candidate attributes, not final scores.

2. **Review / Evidence Aggregation** (`scripts/ingestion/aggregateEvidence.ts`)
   - Merges base + editorial/review evidence.
   - Deduplicates repeated claims.
   - Preserves provenance and confidence.

3. **Ranking Engine** (`lib/ranking/dipscore.ts` + `scripts/scoring/generateScores.ts`)
   - Deterministic score computation from canonical venue + evidence.
   - Versioned output (`DIPSCORE_VERSION = v1.1`).
   - Computes category scores + overall + coverage + confidence.
   - Applies ranking eligibility checks.
   - Outputs score records at `data/processed/scores/{slug}.score.json`.

4. **Publishing Layer** (`scripts/ingestion/generateVenueYaml.ts`)
   - Takes canonical + score records.
   - Applies publish gating.
   - Writes derived YAML for frontend consumption only:
     - `content/venues/{city}/{slug}.yml`

5. **Ranking Output Layer** (`lib/ranking/rankings.ts` + `scripts/scoring/generateRankings.ts`)
   - Reads canonical venues and score records.
   - Ranks only eligible venues by deterministic tie-breakers:
     1. overall desc
     2. confidence desc
     3. coverage desc
     4. review count desc (if present)
     5. slug asc

## Canonical contracts

Defined in `lib/schema/models.ts`:
- `CanonicalVenue`
- `EvidenceRecord`
- `ScoreRecord`

Validation helpers in `lib/schema/validation.ts` enforce:
- canonical venue validity
- evidence validity
- score validity
- publishability checks

## Ranking eligibility vs publishability

- **Ranking eligible**: strict threshold for global comparability.
- **Publishable page**: can be less strict, but still requires minimum coverage and safe display fields.

This allows: publishable page ≠ rankable venue.

## Confidence and coverage behavior

- `coverage_score`: measures category breadth + evidence depth.
- `confidence_score`: average evidence confidence adjusted by human verification ratio.
- Scores are penalized if confidence or coverage are weak.

## Future compatibility

This contract supports:
- **Global Bathing Map**: filterable canonical + score records.
- **Dip Reviews**: editorial/review evidence enters aggregation layer without changing scoring API.
- **Bathpass / passport**: attach usage/membership metadata to canonical IDs.
- **Booking integrations**: map providers and inventory to canonical venue IDs.

## Tradeoffs

- Uses lightweight in-repo validation rather than introducing heavy schema dependencies.
- Current classification remains heuristic for discovery, but its output is explicitly non-authoritative and evidence-backed.

### Fixture-based offline checks

When network access is restricted, run:

```bash
node scripts/ingestion/osmDiscovery.ts new-york --fixture=test/fixtures/osm/new-york.overpass.json --bbox=40.71,-74.02,40.73,-73.98
node scripts/ingestion/googleEnrich.ts new-york --fixture=test/fixtures/google/new-york.enrich.json
```

This produces deterministic discovery outputs without external API calls.
