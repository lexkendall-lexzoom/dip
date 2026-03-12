import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { CanonicalVenue, EvidenceRecord, ScoreRecord } from "../../lib/schema/models.ts";
import { validateCanonicalVenue, validateScoreRecord, validateYamlPublishability } from "../../lib/schema/validation.ts";
import { jaccardSimilarity } from "../../lib/schema/canonicalization.ts";

type QaIssue = {
  venue_id: string;
  slug: string;
  issue: string;
  severity: "warning" | "error";
  details?: string;
};

type DuplicateIssue = {
  venue_a: { id: string; slug: string; name: string; city: string };
  venue_b: { id: string; slug: string; name: string; city: string };
  similarity_score: number;
  reason: string;
};

type QaOptions = {
  venuesDir: string;
  evidenceDir: string;
  scoresDir: string;
  reviewRoot: string;
};

const LOW_CONFIDENCE_THRESHOLD = 0.5;
const LOW_COVERAGE_THRESHOLD = 0.45;
const SUSPICIOUS_SCORE_HIGH = 9.7;
const SUSPICIOUS_SCORE_LOW = 1.0;

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;

const listFiles = (dir: string, suffix: string): string[] => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(suffix))
    .sort()
    .map((file) => path.join(dir, file));
};

const hasInvalidCoordinates = (venue: CanonicalVenue): boolean =>
  Number.isNaN(venue.coordinates.lat)
  || Number.isNaN(venue.coordinates.lng)
  || venue.coordinates.lat < -90
  || venue.coordinates.lat > 90
  || venue.coordinates.lng < -180
  || venue.coordinates.lng > 180;

const evidenceByTypeCount = (evidence: EvidenceRecord[], type: EvidenceRecord["claim_type"]): number =>
  evidence.filter((record) => record.claim_type === type).length;

const detectDuplicates = (venues: CanonicalVenue[]): DuplicateIssue[] => {
  const duplicates: DuplicateIssue[] = [];

  for (let i = 0; i < venues.length; i += 1) {
    for (let j = i + 1; j < venues.length; j += 1) {
      const a = venues[i];
      const b = venues[j];

      const sameCity = a.city.toLowerCase().trim() === b.city.toLowerCase().trim();
      if (!sameCity) continue;

      const websiteA = (a.website ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
      const websiteB = (b.website ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

      if (websiteA && websiteB && websiteA === websiteB) {
        duplicates.push({
          venue_a: { id: a.id, slug: a.slug, name: a.name, city: a.city },
          venue_b: { id: b.id, slug: b.slug, name: b.name, city: b.city },
          similarity_score: 1,
          reason: "Exact website match",
        });
        continue;
      }

      const similarity = jaccardSimilarity(a.name, b.name);
      if (similarity >= 0.7) {
        duplicates.push({
          venue_a: { id: a.id, slug: a.slug, name: a.name, city: a.city },
          venue_b: { id: b.id, slug: b.slug, name: b.name, city: b.city },
          similarity_score: similarity,
          reason: "High name similarity in same city",
        });
      }
    }
  }

  return duplicates;
};

const ensureDir = (dir: string): void => fs.mkdirSync(dir, { recursive: true });

const writeReport = (filePath: string, data: unknown): void => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

export function runQa(options: QaOptions): { duplicatePath: string; lowConfidencePath: string; publishBlockedPath: string } {
  const venueFiles = listFiles(options.venuesDir, ".canonical.json");
  const scoreFiles = listFiles(options.scoresDir, ".score.json");

  const venues = venueFiles.map((file) => readJson<CanonicalVenue>(file));
  const scores = scoreFiles.map((file) => readJson<ScoreRecord>(file));
  const scoreMap = new Map(scores.map((score) => [score.venue_id, score]));

  const duplicateIssues = detectDuplicates(venues);

  const lowConfidenceIssues: QaIssue[] = [];
  const publishBlockedIssues: QaIssue[] = [];

  venues.forEach((venue) => {
    const score = scoreMap.get(venue.id);
    const evidencePath = path.join(options.evidenceDir, `${venue.slug}.evidence.json`);
    const evidence = fs.existsSync(evidencePath) ? readJson<EvidenceRecord[]>(evidencePath) : [];

    const canonicalValidation = validateCanonicalVenue(venue);
    if (!canonicalValidation.valid) {
      publishBlockedIssues.push({
        venue_id: venue.id,
        slug: venue.slug,
        issue: "missing_required_canonical_fields",
        severity: "error",
        details: canonicalValidation.errors.join("; "),
      });
    }

    if (hasInvalidCoordinates(venue)) {
      publishBlockedIssues.push({
        venue_id: venue.id,
        slug: venue.slug,
        issue: "invalid_coordinates",
        severity: "error",
      });
    }

    if (!score) {
      lowConfidenceIssues.push({
        venue_id: venue.id,
        slug: venue.slug,
        issue: "missing_score_record",
        severity: "error",
      });
      return;
    }

    const scoreValidation = validateScoreRecord(score);
    if (!scoreValidation.valid) {
      publishBlockedIssues.push({
        venue_id: venue.id,
        slug: venue.slug,
        issue: "invalid_score_record",
        severity: "error",
        details: scoreValidation.errors.join("; "),
      });
    }

    if (evidenceByTypeCount(evidence, "facilities") < 1) {
      publishBlockedIssues.push({
        venue_id: venue.id,
        slug: venue.slug,
        issue: "no_facilities_evidence",
        severity: "error",
      });
    }

    if (score.coverage_score < LOW_COVERAGE_THRESHOLD) {
      lowConfidenceIssues.push({
        venue_id: venue.id,
        slug: venue.slug,
        issue: "weak_evidence_coverage",
        severity: "warning",
        details: `coverage_score=${score.coverage_score}`,
      });
    }

    if (score.confidence_score < LOW_CONFIDENCE_THRESHOLD) {
      lowConfidenceIssues.push({
        venue_id: venue.id,
        slug: venue.slug,
        issue: "low_confidence_score",
        severity: "warning",
        details: `confidence_score=${score.confidence_score}`,
      });
    }

    if (!score.ranking_eligible) {
      lowConfidenceIssues.push({
        venue_id: venue.id,
        slug: venue.slug,
        issue: "ranking_ineligible",
        severity: "warning",
        details: score.explanation.eligibility_blockers.join("; "),
      });
    }

    const publishable = validateYamlPublishability(venue, score).valid;
    if (publishable && !score.ranking_eligible) {
      publishBlockedIssues.push({
        venue_id: venue.id,
        slug: venue.slug,
        issue: "publishable_but_non_rankable",
        severity: "warning",
      });
    }

    if (score.overall > SUSPICIOUS_SCORE_HIGH || score.overall < SUSPICIOUS_SCORE_LOW) {
      lowConfidenceIssues.push({
        venue_id: venue.id,
        slug: venue.slug,
        issue: "suspicious_outlier_score",
        severity: "warning",
        details: `overall=${score.overall}`,
      });
    }
  });

  const duplicatePath = path.join(options.reviewRoot, "duplicates", "venues.json");
  const lowConfidencePath = path.join(options.reviewRoot, "low-confidence", "venues.json");
  const publishBlockedPath = path.join(options.reviewRoot, "publish-blocked", "venues.json");

  writeReport(duplicatePath, {
    generated_at: new Date().toISOString(),
    count: duplicateIssues.length,
    duplicates: duplicateIssues,
  });

  writeReport(lowConfidencePath, {
    generated_at: new Date().toISOString(),
    count: lowConfidenceIssues.length,
    issues: lowConfidenceIssues.sort((a, b) => `${a.slug}:${a.issue}`.localeCompare(`${b.slug}:${b.issue}`)),
  });

  writeReport(publishBlockedPath, {
    generated_at: new Date().toISOString(),
    count: publishBlockedIssues.length,
    issues: publishBlockedIssues.sort((a, b) => `${a.slug}:${a.issue}`.localeCompare(`${b.slug}:${b.issue}`)),
  });

  return { duplicatePath, lowConfidencePath, publishBlockedPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const [
    venuesDir = "data/processed/venues",
    evidenceDir = "data/processed/evidence",
    scoresDir = "data/processed/scores",
    reviewRoot = "data/review",
  ] = process.argv.slice(2);

  const result = runQa({
    venuesDir: path.resolve(venuesDir),
    evidenceDir: path.resolve(evidenceDir),
    scoresDir: path.resolve(scoresDir),
    reviewRoot: path.resolve(reviewRoot),
  });

  process.stdout.write(`Wrote duplicate report: ${result.duplicatePath}\n`);
  process.stdout.write(`Wrote low-confidence report: ${result.lowConfidencePath}\n`);
  process.stdout.write(`Wrote publish-blocked report: ${result.publishBlockedPath}\n`);
}
