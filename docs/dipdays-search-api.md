# DipDays Search API (v1 deterministic)

This API exposes the existing deterministic search stack as a server-side endpoint.

## Endpoint

- `GET /api/search`

(Implemented as a Netlify Function with redirect to `/.netlify/functions/search`.)

## Query param

- `q` (required): raw natural-language query.

If `q` is missing or blank, API returns `400`.

## Example request

```bash
curl "http://localhost:8888/api/search?q=best%20sauna%20in%20Brooklyn"
```

## Example response

```json
{
  "query": "best sauna in Brooklyn",
  "intent": {
    "location": { "borough": "brooklyn" },
    "required_facets": { "has_sauna": true },
    "preferred_tags": [],
    "sort": "best"
  },
  "results": [
    {
      "venue_id": "othership-flatiron-new-york",
      "name": "Othership Flatiron",
      "city": "New York",
      "neighborhood": "Flatiron",
      "borough": "Manhattan",
      "primary_category": "Social Sauna",
      "score": 8.7,
      "website": "https://www.othership.us",
      "search_tags": ["social", "ritual-led", "urban"],
      "reasons": [
        "Matches social sauna archetype",
        "Has sauna and cold plunge",
        "Located in Manhattan"
      ]
    }
  ]
}
```

## Behavior notes

- Deterministic and file-backed for v1.
- Uses existing modules:
  - `resolveQuery()`
  - `filterVenues()`
  - `rankSearchResults()`
- Reads from:
  - `data/processed/venues/*.canonical.json`
  - `data/processed/scores/*.score.json`
  - `data/processed/evidence/*.reviews.evidence.json` (when present)
- No embeddings/vector search, no LLM calls, and no scoring formula changes in this layer.

## Smoke checks

```bash
node - <<'NODE'
import { searchVenues } from './lib/search/searchVenues.ts';
console.log(searchVenues('best sauna in Brooklyn'));
console.log(searchVenues('best cold plunge in Berlin'));
NODE
```
