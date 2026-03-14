import { discoverVenues } from "./discoverVenues.ts";
import { enrichVenue } from "./enrichVenue.ts";
import { normalizeVenue } from "./normalizeVenue.ts";
import { generateVenueFile } from "./generateVenueFile.ts";

type RunSummary = {
  discovered: number;
  enriched: number;
  created: number;
  skipped_existing: number;
  failed: number;
};

const parseCitySlug = (args: string[]): string => {
  const citySlug = args[0]?.trim();
  if (!citySlug) {
    throw new Error("Usage: npm run populate:city -- <city-slug>");
  }
  return citySlug;
};

const run = async (): Promise<void> => {
  const citySlug = parseCitySlug(process.argv.slice(2));

  process.stdout.write(`Running DipDays city venue population for ${citySlug}\n`);

  const summary: RunSummary = {
    discovered: 0,
    enriched: 0,
    created: 0,
    skipped_existing: 0,
    failed: 0,
  };

  const candidates = await discoverVenues(citySlug);
  summary.discovered = candidates.length;

  for (const candidate of candidates) {
    try {
      const enriched = await enrichVenue(candidate);
      summary.enriched += 1;

      const normalized = normalizeVenue(enriched);
      const writeResult = generateVenueFile(citySlug, normalized);

      if (writeResult.status === "created") {
        summary.created += 1;
      } else {
        summary.skipped_existing += 1;
      }
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[failed] ${candidate.name}: ${message}\n`);
    }
  }

  process.stdout.write("\nPopulation summary\n");
  process.stdout.write(`- discovered: ${summary.discovered}\n`);
  process.stdout.write(`- enriched: ${summary.enriched}\n`);
  process.stdout.write(`- created: ${summary.created}\n`);
  process.stdout.write(`- skipped_existing: ${summary.skipped_existing}\n`);
  process.stdout.write(`- failed: ${summary.failed}\n`);

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
