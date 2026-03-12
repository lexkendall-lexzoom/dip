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
- Reads from bundled runtime files:
  - `data/processed/venues/*.canonical.json`
  - `data/processed/scores/*.score.json`
  - `data/processed/evidence/*.reviews.evidence.json` (when present)
- Search data path resolution is runtime-safe for both local and Netlify/serverless execution; it does **not** assume a fixed working directory.
- No embeddings/vector search, no LLM calls, and no scoring formula changes in this layer.

## Runtime dataset requirements

The search function requires:

- canonical venue artifacts (`venues`)
- scoring artifacts (`scores`)

Review evidence files are optional for ranking boosts, but are loaded and counted when present.

If canonical venues or scores cannot be loaded, the API returns:

```json
{
  "error": "SEARCH_DATA_LOAD_FAILED",
  "message": "Search dataset could not be loaded."
}
```

This is intentionally different from a successful empty match (`200` with `results: []`), which means the dataset loaded correctly but no venues matched the query.

## Diagnostics

On each successful search data load, the function logs dataset diagnostics including:

- `venuesLoaded`
- `scoresLoaded`
- `reviewEvidenceLoaded`
- resolved root/path details used to locate `data/processed/*`

On load failure, the function logs attempted roots/paths and returns a stable `500` payload.

## Netlify bundling expectation

`netlify.toml` includes search dataset artifacts in the function bundle via `[functions].included_files` so deployed functions can read file-backed search data at runtime.

## Verification

### 1) Local module load

```bash
node --experimental-strip-types --input-type=module -e "import { searchVenues } from './lib/search/searchVenues.ts'; const out = searchVenues('best sauna in Brooklyn'); console.log({ results: out.results.length });"
```

Expected: logs include non-zero `venuesLoaded` and `scoresLoaded`, and command prints `results` (may be zero/non-zero based on query coverage).

### 2) Local Netlify function invocation

```bash
node --experimental-strip-types --input-type=module -e "import { handler } from './netlify/functions/search.ts'; const out = await handler({ queryStringParameters: { q: 'best cold plunge in Berlin' } }); console.log(out.statusCode, out.body.slice(0, 180));"
```

Expected: `200` with a normal search payload, or `500` with `SEARCH_DATA_LOAD_FAILED` if artifacts are unavailable.

### 3) Real query checks

Try one or both:

- `best sauna in Brooklyn`
- `best cold plunge in Berlin`

Expected behavior:

- dataset load counts in logs are greater than zero for venues/scores
- API response is either real search output, or explicit load failure error
- no silent "empty because data failed to load" behavior
