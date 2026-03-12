import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSupabaseServiceClient } from "../../lib/db/supabase.ts";

const CORE_TABLES = ["venues", "facilities", "reviews", "scores"] as const;

export async function verifyCoreSchema(): Promise<void> {
  const supabase = await createSupabaseServiceClient();

  for (const table of CORE_TABLES) {
    const { error } = await supabase
      .from(table)
      .select("id", { head: true, count: "exact" })
      .limit(1);

    if (error) {
      throw new Error(
        `Core schema verification failed for table '${table}': ${error.message}. `
        + "Run schema bootstrap first (node scripts/supabase/createCoreTables.mjs).",
      );
    }
  }

  process.stdout.write(`Core schema verified: ${CORE_TABLES.join(", ")}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  verifyCoreSchema().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
