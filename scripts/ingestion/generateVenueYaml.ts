import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import type { CanonicalVenue, ScoreRecord } from "../../lib/schema/models.ts";
import { validateCanonicalVenue, validateScoreRecord, validateYamlPublishability } from "../../lib/schema/validation.ts";
import yaml from "js-yaml";
import { CanonicalVenue, ScoreRecord } from "../../lib/schema/models";
import { validateCanonicalVenue, validateScoreRecord, validateYamlPublishability } from "../../lib/schema/validation";

const toCitySlug = (city: string): string =>
  city
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function generateVenueYaml(venue: CanonicalVenue, score: ScoreRecord, editorial: Record<string, unknown> = {}): string {
  const payload = {
    name: venue.name,
    slug: venue.slug,
    city: venue.city,
    country: venue.country,
    categories: venue.categories,
    features: venue.features,
    dip_scores: {
      ritual_quality: score.ritual_quality,
      aesthetic_design: score.aesthetic_design,
      social_energy: score.social_energy,
      facilities: score.facilities,
      recovery_wellness: score.recovery_wellness,
      overall: score.overall,
    },
    ranking_metadata: {
      score_version: score.score_version,
      ranking_eligible: score.ranking_eligible,
      confidence_score: score.confidence_score,
      coverage_score: score.coverage_score,
    },
    last_verified_at: venue.last_verified_at,
    ...editorial,
  };

  return yaml.dump(payload, { noRefs: true, lineWidth: 120 });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
if (require.main === module) {
  const [canonicalPath, scorePath, outputRoot = "content/venues", editorialPath] = process.argv.slice(2);

  if (!canonicalPath || !scorePath) {
    throw new Error("Usage: node scripts/ingestion/generateVenueYaml.ts <canonical-venue.json> <score-record.json> [output-root] [editorial-json]");
  }

  const venue = JSON.parse(fs.readFileSync(path.resolve(canonicalPath), "utf8")) as CanonicalVenue;
  const score = JSON.parse(fs.readFileSync(path.resolve(scorePath), "utf8")) as ScoreRecord;
  const editorial = editorialPath ? JSON.parse(fs.readFileSync(path.resolve(editorialPath), "utf8")) as Record<string, unknown> : {};

  const venueValidation = validateCanonicalVenue(venue);
  if (!venueValidation.valid) throw new Error(`Canonical venue invalid: ${venueValidation.errors.join(", ")}`);

  const scoreValidation = validateScoreRecord(score);
  if (!scoreValidation.valid) throw new Error(`Score invalid: ${scoreValidation.errors.join(", ")}`);

  const publishability = validateYamlPublishability(venue, score);
  if (!publishability.valid) {
    throw new Error(`Venue is not publishable: ${publishability.errors.join(", ")}`);
  }

  const outputDir = path.resolve(outputRoot, toCitySlug(venue.city));
  fs.mkdirSync(outputDir, { recursive: true });

  const outputFile = path.join(outputDir, `${venue.slug}.yml`);
  fs.writeFileSync(outputFile, generateVenueYaml(venue, score, editorial), "utf8");

  process.stdout.write(`Generated ${outputFile}\n`);
}
