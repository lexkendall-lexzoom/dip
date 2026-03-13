# DipDays search root-cause investigation (diagnosis)

## Findings

1. **Active search source is file-backed, not Supabase.**
   - UI calls `/api/search`.
   - Netlify redirect maps `/api/search` to `/.netlify/functions/search`.
   - Search function delegates to `searchVenues()`.
   - `searchVenues()` loads data via `loadSearchData()` from `data/processed/venues`, `data/processed/scores`, and `data/processed/evidence/*.reviews.evidence.json`.
   - Netlify function bundle explicitly includes those file artifacts.

2. **Supabase is not in the runtime search path.**
   - No Supabase client is used in `netlify/functions/search.ts` or `lib/search/searchVenues.ts`.
   - Supabase is only used by sync/verification scripts and gated by env vars.

3. **DB population cannot be verified in this environment and likely has not been continuously synced.**
   - `verifyCoreSchema` fails immediately without `SUPABASE_URL`.
   - City pipeline runs DB sync only when `review_flags_count === 0`.
   - Latest checked pipeline receipt has `review_flags_count: 61`, which means DB sync would be skipped for that run.

4. **File-backed dataset is internally healthy for launch cities but limited in city coverage.**
   - Local artifacts currently provide 40 canonical venues and 40 score files.
   - Search queries for Brooklyn/Manhattan return ranked results.
   - Query for Berlin returns zero results because no canonical Berlin venues are present in `data/processed/venues`.

5. **Search is runtime file-read; there is no separate index/reindex job.**
   - Regeneration means rewriting canonical/evidence/score artifacts.
   - If city coverage is missing (for example Berlin), rerun city population pipeline for the target cities (after city config/discovery support exists).

## Root cause statement

The search bar is still powered by the deterministic file-backed artifact loader, not Supabase; therefore DB state does not affect current search results. Current no-result behavior for Berlin is caused by missing Berlin canonical/scores artifacts in `data/processed/*`, not by a broken Supabase query path.

## Narrow next action

If expected behavior includes Berlin (or other non-launch cities), add/execute population for those city artifacts and regenerate scores; otherwise keep launch-city expectations explicit and avoid assuming DB sync changes search behavior until search API is intentionally migrated to a DB-backed loader.
