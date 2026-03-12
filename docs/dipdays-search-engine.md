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
