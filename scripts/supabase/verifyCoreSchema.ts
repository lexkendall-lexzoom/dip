import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSupabaseServiceClient } from "../../lib/db/supabase.ts";

const CORE_TABLE_COLUMNS: Record<string, string> = {
  venues: "id",
  facilities: "id",
  reviews: "id",
  scores: "venue_id",
};

export async function verifyCoreSchema(): Promise<void> {
  const supabase = await createSupabaseServiceClient();

  for (const [table, keyColumn] of Object.entries(CORE_TABLE_COLUMNS)) {
    const { error } = await supabase
      .from(table)
      .select(keyColumn, { head: true, count: "exact" })
      .limit(1);

    if (error) {
      throw new Error(
        `Core schema verification failed for table '${table}' (key column '${keyColumn}'): ${error.message}. `
        + "Run schema bootstrap first (node scripts/supabase/createCoreTables.mjs).",
      );
    }
  }

  process.stdout.write(`Core schema verified: ${Object.keys(CORE_TABLE_COLUMNS).join(", ")}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  verifyCoreSchema().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
