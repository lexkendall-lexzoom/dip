import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import type { NormalizedVenueFile } from "./normalizeVenue.ts";

export type GenerateVenueFileResult = {
  status: "created" | "skipped_existing";
  outputPath: string;
};

export function generateVenueFile(citySlug: string, normalizedVenue: NormalizedVenueFile): GenerateVenueFileResult {
  const outputDir = path.resolve("content/venues", citySlug);
  const outputPath = path.join(outputDir, `${normalizedVenue.venue.slug}.yml`);

  fs.mkdirSync(outputDir, { recursive: true });

  if (fs.existsSync(outputPath)) {
    process.stdout.write(`[skip] ${outputPath} already exists.\n`);
    return { status: "skipped_existing", outputPath };
  }

  const payload = yaml.dump(normalizedVenue, {
    noRefs: true,
    lineWidth: 120,
    sortKeys: false,
  });

  fs.writeFileSync(outputPath, payload, "utf8");
  process.stdout.write(`[create] ${outputPath}\n`);
  return { status: "created", outputPath };
}
