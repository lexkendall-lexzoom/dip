import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MODE = process.env.SUPABASE_BOOTSTRAP_MODE ?? "sql-over-http";

const migrationPath = new URL("../../db/migrations/001_init_dipdays.sql", import.meta.url);
const sql = await readFile(migrationPath, "utf8");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY) {
  fail("Missing SUPABASE_SERVICE_KEY. Set it in your environment before running bootstrap.");
}

async function runViaDatabaseUrl() {
  if (!DATABASE_URL) {
    fail("Missing DATABASE_URL. Set DATABASE_URL when SUPABASE_BOOTSTRAP_MODE=database-url.");
  }

  await new Promise((resolve, reject) => {
    const child = spawn("psql", [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-f", migrationPath.pathname], {
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`psql exited with code ${code}`));
      }
    });
  });

  console.log("Migration applied via DATABASE_URL.");
}

async function runViaSqlOverHttp() {
  if (!SUPABASE_URL) {
    fail("Missing SUPABASE_URL. Set SUPABASE_URL when SUPABASE_BOOTSTRAP_MODE=sql-over-http.");
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const body = await response.text();
    fail(`Failed to apply schema over HTTP (${response.status}): ${body}`);
  }

  const body = await response.text();
  console.log("Migration applied via Supabase SQL-over-HTTP.");
  if (body) {
    console.log(body);
  }
}

if (MODE === "database-url") {
  await runViaDatabaseUrl();
} else if (MODE === "sql-over-http") {
  await runViaSqlOverHttp();
} else {
  fail(`Unsupported SUPABASE_BOOTSTRAP_MODE: ${MODE}. Use 'database-url' or 'sql-over-http'.`);
}
