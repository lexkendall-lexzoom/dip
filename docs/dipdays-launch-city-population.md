# DipDays Launch City Population Runbook

This runbook operationalizes search data population for the five launch cities:

- `new-york`
- `san-francisco`
- `los-angeles`
- `miami`
- `chicago`

The process uses the existing deterministic city pipeline and writes compact per-city summaries.

## Commands

### Populate all launch cities

```bash
npm run populate:launch
```

### Populate one city

```bash
npm run populate:city -- new-york
```

### Optional flags

You can pass flags directly to the runner:

```bash
node --experimental-strip-types scripts/agents/runLaunchCities.ts --city new-york --limit 100
node --experimental-strip-types scripts/agents/runLaunchCities.ts --dry-run
```

- `--city <slug>`: run only one (or several via repeated flags / comma-separated values).
- `--limit <n>`: override candidate discovery cap via `CITY_PIPELINE_MAX_CANDIDATES`.
- `--dry-run`: print target cities and options without executing pipelines.

## What the batch runner does

For each city, `scripts/agents/runLaunchCities.ts`:

1. Calls `runCityPipeline(citySlug)`.
2. Reads `data/processed/pipeline/<city>.run.json`.
3. Emits and writes a compact summary to `data/processed/pipeline/<city>.summary.json`:

```json
{
  "city": "new-york",
  "discovery_candidates": 42,
  "canonical_venues": 18,
  "evidence_artifacts": 12,
  "score_records": 18,
  "status": "success"
}
```

If one city fails, the runner continues with the next city and prints a failure summary at the end.

## Expected outputs after a successful city run

- Discovery candidates: `data/raw/discovery/<city>.json`
- Canonical venues: `data/processed/venues/*.canonical.json`
- Evidence artifacts: `data/processed/evidence/*.evidence.json`
- Score records: `data/processed/scores/*.score.json`
- Pipeline receipt: `data/processed/pipeline/<city>.run.json`
- Compact summary: `data/processed/pipeline/<city>.summary.json`

## How to check if a city is searchable

A city is effectively searchable when:

1. It has canonical venues in `data/processed/venues/` for that city slug.
2. Those venues have score records in `data/processed/scores/`.
3. The latest `data/processed/pipeline/<city>.run.json` has `"status": "success"`.
4. `data/processed/pipeline/<city>.summary.json` shows non-zero `canonical_venues` and `score_records`.

You can then query the search API for that city (for example borough/city intent queries) and confirm non-empty results.
