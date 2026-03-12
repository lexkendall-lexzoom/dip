import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { calculateDipScore } from "../../lib/ranking/dipscore.ts";
import type { CanonicalVenue, EvidenceRecord } from "../../lib/schema/models.ts";
import { validateCanonicalVenue, validateEvidenceRecord, validateScoreRecord } from "../../lib/schema/validation.ts";

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;

export function generateScores(venues: CanonicalVenue[], evidenceByVenue: Record<string, EvidenceRecord[]>) {
  return venues.map((venue) => {
    const venueCheck = validateCanonicalVenue(venue);
    if (!venueCheck.valid) {
      throw new Error(`Invalid canonical venue ${venue.slug}: ${venueCheck.errors.join(", ")}`);
    }

    const evidence = evidenceByVenue[venue.id] ?? [];
    evidence.forEach((record) => {
      const check = validateEvidenceRecord(record);
      if (!check.valid) {
        throw new Error(`Invalid evidence ${record.id}: ${check.errors.join(", ")}`);
      }
    });

    const score = calculateDipScore(venue, evidence);
    const scoreCheck = validateScoreRecord(score);
    if (!scoreCheck.valid) {
      throw new Error(`Invalid score for ${venue.slug}: ${scoreCheck.errors.join(", ")}`);
    }

    return score;
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const [venueDir = "data/processed/venues", evidenceDir = "data/processed/evidence", outputDir = "data/processed/scores"] = process.argv.slice(2);

  const venueFiles = fs.readdirSync(path.resolve(venueDir)).filter((name) => name.endsWith(".canonical.json"));
  const venues = venueFiles.map((file) => readJson<CanonicalVenue>(path.resolve(venueDir, file)));

  const evidenceByVenue: Record<string, EvidenceRecord[]> = {};
  venues.forEach((venue) => {
    const evidencePath = path.resolve(evidenceDir, `${venue.slug}.evidence.json`);
    evidenceByVenue[venue.id] = fs.existsSync(evidencePath) ? readJson<EvidenceRecord[]>(evidencePath) : [];
  });

  const scores = generateScores(venues, evidenceByVenue);
  fs.mkdirSync(path.resolve(outputDir), { recursive: true });

  scores.forEach((score) => {
    const outPath = path.resolve(outputDir, `${score.venue_id}.score.json`);
    fs.writeFileSync(outPath, `${JSON.stringify(score, null, 2)}\n`, "utf8");
  });

  process.stdout.write(`Generated ${scores.length} score files in ${path.resolve(outputDir)}\n`);
}
