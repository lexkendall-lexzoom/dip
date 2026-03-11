# Supabase Bootstrap for DipDays

This repo includes a deterministic SQL migration for the current DipDays operational schema:

- `db/migrations/001_init_dipdays.sql`

And a bootstrap runner:

- `scripts/supabase/createCoreTables.mjs`

## Important sandbox note

Codex and some CI/sandbox environments may be unable to reach Supabase over the network (proxy/egress restrictions).
Do **not** assume remote schema application succeeded unless the migration command returns a successful Supabase response.

## Environment variables

Required:

- `SUPABASE_SERVICE_KEY`
- `DATABASE_URL` (when running with `SUPABASE_BOOTSTRAP_MODE=database-url`)
- `SUPABASE_URL` (when running with `SUPABASE_BOOTSTRAP_MODE=sql-over-http`)

## Local commands

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

## GitHub Actions example

Create `.github/workflows/supabase-migrate.yml` (included in this repo) and set these secrets:

- `SUPABASE_SERVICE_KEY`
- `DATABASE_URL`

Then run the workflow manually or on your preferred trigger.
