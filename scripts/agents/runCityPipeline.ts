import fs from "fs";
import path from "path";
import { promises as fsp } from "fs";
import { fileURLToPath } from "url";
import { runDiscovery } from "./runDiscovery.ts";
import { runCanonicalization } from "./runCanonicalization.ts";
import { extractEvidence } from "./runEvidenceExtraction.ts";
import { runQa } from "./runQa.ts";
import { generateScores } from "../scoring/generateScores.ts";
import { generateVenueYaml } from "../ingestion/generateVenueYaml.ts";
import { DIPSCORE_VERSION } from "../../lib/ranking/dipscore.ts";
import type { CanonicalVenue, EvidenceRecord } from "../../lib/schema/models.ts";
import { validateYamlPublishability } from "../../lib/schema/validation.ts";

type CityConfig = {
  city: string;
  city_slug: string;
  country: string;
  content_city_slug?: string;
  seed_sources?: Array<{ source_label: string; source_url: string }>;
  manual_candidates?: Array<{
    name: string;
    website?: string;
    address?: string;
    snippets?: string[];
    source_urls?: string[];
  }>;
  max_candidates?: number;
};

type SourcePayload = {
  source_type: "official_site" | "review" | "editorial" | "aggregator" | "manual";
  source_url: string;
  source_label: string;
  text?: string;
  structured?: Record<string, unknown>;
};

type PipelineReceipt = {
  city: string;
  ran_at: string;
  score_version: string;
  candidates_found: number;
  canonical_venues_written: number;
  evidence_records_written: number;
  scores_written: number;
  ranking_eligible_count: number;
  review_flags_count: number;
  publish_blocked_count: number;
  published_pages_count: number;
  status: "success" | "failed";
  error_message: string | null;
};

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
const writeJson = async (filePath: string, payload: unknown): Promise<void> => {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const listCanonicalByCity = (citySlug: string): CanonicalVenue[] => {
  const directory = path.resolve("data/processed/venues");
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory)
    .filter((file) => file.endsWith(".canonical.json"))
    .map((file) => readJson<CanonicalVenue>(path.join(directory, file)))
    .filter((venue) => toSlug(venue.city) === citySlug || venue.slug.endsWith(`-${citySlug}`));
};

const sourcePayloadPath = (slug: string): string => path.resolve("data/raw/sources", `${slug}.sources.json`);

const parseArgs = (args: string[]): { citySlug: string; publish: boolean } => {
  const citySlug = args.find((arg) => !arg.startsWith("--"));
  if (!citySlug) {
    throw new Error("Usage: node scripts/agents/runCityPipeline.ts <city-slug> [--publish]");
  }

  return {
    citySlug,
    publish: args.includes("--publish"),
  };
};

const receiptPathForCity = (citySlug: string): string => path.resolve("data/processed/pipeline", `${citySlug}.run.json`);

const writeReceiptSafe = async (receiptPath: string, receipt: PipelineReceipt): Promise<void> => {
  try {
    await writeJson(receiptPath, receipt);
    process.stdout.write(`Pipeline receipt written to:\n${path.relative(process.cwd(), receiptPath)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`Warning: failed to write pipeline receipt (${message})\n`);
  }
};

export async function runCityPipeline(citySlug: string, publish = false): Promise<void> {
  const ranAt = new Date().toISOString();
  const receiptPath = receiptPathForCity(citySlug);

  const metrics = {
    candidates_found: 0,
    canonical_venues_written: 0,
    evidence_records_written: 0,
    scores_written: 0,
    ranking_eligible_count: 0,
    review_flags_count: 0,
    publish_blocked_count: 0,
    published_pages_count: 0,
  };

  try {
    const configPath = path.resolve("configs/cities", `${citySlug}.json`);
    if (!fs.existsSync(configPath)) {
      throw new Error(`City config not found: ${configPath}`);
    }

    const config = readJson<CityConfig>(configPath);

    // 1) discovery
    const candidates = runDiscovery(config);
    metrics.candidates_found = candidates.length;
    const discoveryPath = path.resolve("data/raw/discovery", `${config.city_slug}.json`);
    await writeJson(discoveryPath, candidates);

    // 2) canonicalization
    const canonicalizationResult = runCanonicalization(discoveryPath);
    metrics.canonical_venues_written = canonicalizationResult.written.length;
    const canonicalVenues = listCanonicalByCity(citySlug);

    // 3) evidence extraction
    const evidenceByVenue: Record<string, EvidenceRecord[]> = {};

    for (const venue of canonicalVenues) {
      const sourcePath = sourcePayloadPath(venue.slug);
      const sources = fs.existsSync(sourcePath)
        ? readJson<SourcePayload[]>(sourcePath)
        : [];

      const evidence = extractEvidence({ canonical: venue, sources });
      evidenceByVenue[venue.id] = evidence;
      metrics.evidence_records_written += evidence.length;

      const evidenceOutputPath = path.resolve("data/processed/evidence", `${venue.slug}.evidence.json`);
      await writeJson(evidenceOutputPath, evidence);
    }

    // 4) scoring
    const scores = generateScores(canonicalVenues, evidenceByVenue);
    metrics.scores_written = scores.length;

    for (const score of scores) {
      const scorePath = path.resolve("data/processed/scores", `${score.venue_id}.score.json`);
      await writeJson(scorePath, score);
    }

    metrics.ranking_eligible_count = scores.filter((score) => score.ranking_eligible).length;

    // 5) QA
    const qaResult = runQa({
      venuesDir: path.resolve("data/processed/venues"),
      evidenceDir: path.resolve("data/processed/evidence"),
      scoresDir: path.resolve("data/processed/scores"),
      reviewRoot: path.resolve("data/review"),
    });

    const duplicateCount = readJson<{ count: number }>(qaResult.duplicatePath).count;
    const lowConfidenceCount = readJson<{ count: number }>(qaResult.lowConfidencePath).count;
    const publishBlockedCount = readJson<{ count: number }>(qaResult.publishBlockedPath).count;
    metrics.publish_blocked_count = publishBlockedCount;
    metrics.review_flags_count = duplicateCount + lowConfidenceCount + publishBlockedCount;

    // 6) optional publish
    if (publish) {
      const scoreMap = new Map(scores.map((score) => [score.venue_id, score]));

      if (publishBlockedCount > 0) {
        process.stdout.write("publish: skipped (validation/QA issues detected)\n");
      } else {
        for (const venue of canonicalVenues) {
          const score = scoreMap.get(venue.id);
          if (!score) continue;

          const publishValidation = validateYamlPublishability(venue, score);
          if (!publishValidation.valid) continue;

          const outputDir = path.resolve("content/venues", toSlug(venue.city));
          await fsp.mkdir(outputDir, { recursive: true });
          const yamlOutputPath = path.join(outputDir, `${venue.slug}.yml`);
          await fsp.writeFile(yamlOutputPath, generateVenueYaml(venue, score), "utf8");
          metrics.published_pages_count += 1;
        }
      }
    }

    process.stdout.write(`candidates found: ${metrics.candidates_found}\n`);
    process.stdout.write(`canonical venues written: ${metrics.canonical_venues_written}\n`);
    process.stdout.write(`evidence records written: ${metrics.evidence_records_written}\n`);
    process.stdout.write(`scores written: ${metrics.scores_written}\n`);
    process.stdout.write(`ranking eligible count: ${metrics.ranking_eligible_count}\n`);
    process.stdout.write(`review flags count: ${metrics.review_flags_count}\n`);

    await writeReceiptSafe(receiptPath, {
      city: citySlug,
      ran_at: ranAt,
      score_version: DIPSCORE_VERSION,
      ...metrics,
      status: "success",
      error_message: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await writeReceiptSafe(receiptPath, {
      city: citySlug,
      ran_at: ranAt,
      score_version: DIPSCORE_VERSION,
      ...metrics,
      status: "failed",
      error_message: message,
    });

    throw error;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const { citySlug, publish } = parseArgs(process.argv.slice(2));
  runCityPipeline(citySlug, publish).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
