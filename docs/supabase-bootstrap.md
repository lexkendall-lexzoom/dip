# Supabase Bootstrap for DipDays

This repo includes:

- schema migration: `db/migrations/001_init_dipdays.sql`
- bootstrap runner: `scripts/supabase/createCoreTables.mjs`
- schema verifier: `scripts/supabase/verifyCoreSchema.ts`
- processed artifact sync: `scripts/supabase/syncProcessedData.ts`

## Important sandbox note

Codex and some sandboxed CI environments may not be able to reach Supabase due to proxy/egress rules.
Do **not** assume remote application succeeded unless the command returns a successful Supabase response.

## Venue identity contract (important)

DipDays now uses a split venue identity model end-to-end:

- `venues.id` is a canonical UUID (internal + database foreign-key identity).
- `venues.slug` is the stable human-readable identifier (filenames, URLs, search payload references).

Do not sync slug-like IDs into UUID key columns. If canonical/evidence/score artifacts were generated before this contract, regenerate processed artifacts before sync.

## Required environment variables

- `SUPABASE_SERVICE_KEY` (required for all bootstrap/sync scripts)
- `DATABASE_URL` (required when `SUPABASE_BOOTSTRAP_MODE=database-url`)
- `SUPABASE_URL` (required for schema verification and sync)

## Run order (required)

Run schema bootstrap and schema verification **before** running city pipeline DB sync:

1. bootstrap core tables
2. verify core schema
3. run pipeline / sync

## Local migration commands

Preferred (direct Postgres):

```bash
export SUPABASE_SERVICE_KEY="..."
export DATABASE_URL="postgresql://postgres:...@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"
export SUPABASE_BOOTSTRAP_MODE="database-url"
node scripts/supabase/createCoreTables.mjs
```

Alternative (REST SQL RPC):

```bash
export SUPABASE_SERVICE_KEY="..."
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_BOOTSTRAP_MODE="sql-over-http"
node scripts/supabase/createCoreTables.mjs
```

Verify core schema exists:

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_KEY="..."
npm run verify:supabase-schema
```

Sync processed city artifacts (stage 7 equivalent):

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_KEY="..."
npm run sync:supabase -- new-york
```

## Smoke test

With env vars set, this should complete successfully and upsert rows:

```bash
npm run sync:supabase -- new-york
```

## GitHub Actions commands

Use repository secrets:

- `SUPABASE_SERVICE_KEY`
- `DATABASE_URL`
- `SUPABASE_URL`
- (future) agent provider keys such as OSM/Google keys when those integrations are added

CI should fail early if schema is missing by running schema verification before sync.


## Seed venue import

After schema bootstrap, you can import seed venues:

```bash
node scripts/import_seed_venues.ts data/venues/seed_nyc_hudson.json --dry-run
node scripts/import_seed_venues.ts data/venues/seed_hudson_valley_additions.json --dry-run
node scripts/import_seed_venues.ts data/venues/seed_hudson_valley_additions.json
```

The importer derives `primary_category`, `search_facets`, and `search_tags` using canonicalization helpers and skips duplicates by `name + city`.
