# DipDays Search Engine (Deterministic Query Resolver)

This pass adds a deterministic natural-language query resolver that maps search text to structured retrieval logic over existing canonical + scoring data.

## Modules

- `lib/search/resolveQuery.ts`
- `lib/search/filterVenues.ts`
- `lib/search/rankSearchResults.ts`

## 1) Query resolver

`resolveQuery(query)` returns:

- `location` (`city`, `borough`, `neighborhood`)
- `required_facets` (boolean facet constraints)
- `preferred_category`
- `preferred_tags`
- `sort` (`best` or `nearest`)

Parsing is dictionary/keyword based only (no LLM, no embeddings).

### Examples

- `best sauna in Brooklyn`
  - `location.borough = brooklyn`
  - `required_facets.has_sauna = true`
  - `sort = best`
- `best cold plunge in Berlin`
  - `location.city = berlin`
  - `required_facets.has_cold_plunge = true`
- `social sauna in Manhattan`
  - `location.borough = manhattan`
  - `preferred_category = Social Sauna`
- `luxury wellness club with hyperbaric in LA`
  - `location.city = los-angeles`
  - `required_facets.has_hyperbaric = true`
  - `preferred_tags = ["luxury"]`

## 2) Venue filtering

`filterVenues(venues, intent)` applies strict filters over canonical fields:

- `city` / `borough` / `neighborhood`
- `required_facets` (`has_*` booleans)
- `preferred_category`
- `preferred_tags`

Only venues satisfying all required constraints are returned.

## 3) Ranking logic

`rankSearchResults(filteredVenues, intent)` ranks results by:

1. DipScore `overall` (descending) from `data/processed/scores/*.score.json`
2. Review evidence confidence (descending) from `data/processed/evidence/*.reviews.evidence.json`
3. Facility completeness from canonical `search_facets` coverage (descending)
4. Stable slug tie-breaker

No DipScore formulas are changed in this layer.


## 3b) Intent-weighted query-time adjustment

`rankSearchResults(...)` applies a **small deterministic query-time boost** on top of base DipScore for intent-rich queries.

- Final ordering score is: `final_search_score = base_dipscore + intent_boost`.
- Base DipScore remains dominant; boosts are capped and designed to reorder close matches only.
- Boosts are explicit/dictionary-driven and inspectable (`boost_breakdown`).

Examples of intent boosts:

- Cold plunge intent:
  - `cold_plunge_quality`
  - `cold_plunge_access`
  - `has_cold_plunge`
- Sauna / social sauna intent:
  - `sauna_quality`
  - `ritual_quality`
  - social-sauna category match
- Luxury / wellness-club intent:
  - `thermal_circuit_quality`
  - `design_ambience`
  - `facility_condition`
  - relevant category/tag matches

No DipScore formulas are changed by this layer.

## 3c) Verification path (ordering differences by intent)

```bash
node - <<'NODE'
import fs from 'fs';
import path from 'path';
import { resolveQuery } from './lib/search/resolveQuery.ts';
import { filterVenues } from './lib/search/filterVenues.ts';
import { rankSearchResults } from './lib/search/rankSearchResults.ts';

const venues = fs.readdirSync('data/processed/venues')
  .filter((f) => f.endsWith('.canonical.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join('data/processed/venues', f), 'utf8')));

for (const q of ['best sauna in Brooklyn', 'best cold plunge in Brooklyn', 'best sauna in Manhattan', 'best cold plunge in Manhattan']) {
  const intent = resolveQuery(q);
  const filtered = filterVenues(venues, intent);
  const ranked = rankSearchResults(filtered, intent).slice(0, 5);
  console.log('\n', q);
  console.log(ranked.map((r) => ({ venue: r.venue_slug, score: r.score, boost: r.boost_breakdown?.slice(0, 2) })));
}
NODE
```

You should see intent-dependent score shifts in the returned rows (Brooklyn may be empty in the small sample fixture set; Manhattan demonstrates the reordering path).

## 4) Result explanation

Each result includes a short reasons list, for example:

- archetype/category match
- matched required facets
- location match

## Example query test cases

Fixture file:

- `test/fixtures/search/query-intent.examples.json`

Quick smoke check:

```bash
node - <<'NODE'
import fs from 'fs';
import { resolveQuery } from './lib/search/resolveQuery.ts';
const cases = JSON.parse(fs.readFileSync('test/fixtures/search/query-intent.examples.json', 'utf8'));
for (const c of cases) {
  console.log(c.query, resolveQuery(c.query));
}
NODE
```


## 5) Match explanations

Search results now include short `reasons[]` strings to explain why a venue matched and ranked:

- location matches (city / borough / neighborhood)
- matched required facets (sauna, cold plunge, hyperbaric, etc.)
- preferred category/tag matches
- strong positive review evidence signals (for example ritual quality, cold plunge quality, cleanliness)

Reason generation is deterministic and compact (max 3–5 reasons), with deduping and no vague filler.

### Example reason styles

- **best sauna in Brooklyn**
  - `Has sauna`
  - `Located in Brooklyn`
  - `Strong sauna quality signals`
- **social sauna in Manhattan**
  - `Matches social sauna archetype`
  - `Has sauna`
  - `Located in Manhattan`
  - `Strong ritual quality signals`
- **luxury wellness club with hyperbaric in LA**
  - `Matches social wellness club archetype`
  - `Has hyperbaric`
  - `Matches Luxury vibe`
  - `Strong design and ambience signals`

These explanations improve user trust by making ranking decisions inspectable without exposing raw evidence payloads.


## 6) Location normalization and zero-result fallback

Search keeps strict location filtering by default, but borough-level terms are normalized to improve consistency:

- Borough aliases normalize to: `manhattan`, `brooklyn`, `queens`, `bronx`, `staten island`.
- NYC borough intent also sets `city = new-york` so borough searches stay anchored to New York.
- City aliases continue to resolve deterministically (for example `nyc` -> `new-york`, `la` -> `los-angeles`).

When strict location filtering returns zero rows, the orchestrator applies a narrow deterministic fallback:

1. Drop `neighborhood` and retry.
2. If still empty, drop `borough` and retry city-level while keeping required facets/category/tags.

If fallback is used, payload metadata includes:

- `fallback_applied: true`
- `fallback_note` explaining the scope relaxation.

### Verification examples

- `best sauna in Brooklyn`
  - In current sample data, strict borough match can be empty.
  - Fallback returns New York city sauna candidates with a note.
- `social sauna in Manhattan`
  - Returns exact Manhattan matches (no fallback).
- `best cold plunge in Brooklyn`
  - Uses the same fallback behavior when strict borough results are empty.
