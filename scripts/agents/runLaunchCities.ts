import fs from "fs";
import path from "path";
import { runCityPipeline } from "./runCityPipeline.ts";

type LaunchSummary = {
  city: string;
  discovery_candidates: number;
  canonical_venues: number;
  evidence_artifacts: number;
  score_records: number;
  status: "success" | "failed";
  error_message?: string;
};

const DEFAULT_LAUNCH_CITIES = ["new-york", "san-francisco", "los-angeles", "miami", "chicago"];

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;

const toUniqueCities = (raw: string[]): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of raw) {
    for (const part of value.split(",").map((token) => token.trim()).filter(Boolean)) {
      if (!seen.has(part)) {
        seen.add(part);
        out.push(part);
      }
    }
  }

  return out;
};

const parseArgs = (args: string[]): { cities: string[]; limit?: number; dryRun: boolean } => {
  const cityValues: string[] = [];
  let limit: number | undefined;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--city") {
      const next = args[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("--city requires a value (e.g. --city new-york)");
      }
      cityValues.push(next);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      const next = args[index + 1];
      const parsed = Number(next);
      if (!next || next.startsWith("--") || !Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--limit requires a positive number");
      }
      limit = Math.floor(parsed);
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    cities: cityValues.length > 0 ? toUniqueCities(cityValues) : DEFAULT_LAUNCH_CITIES,
    limit,
    dryRun,
  };
};

const summaryPathForCity = (citySlug: string): string => path.resolve("data/processed/pipeline", `${citySlug}.summary.json`);
const receiptPathForCity = (citySlug: string): string => path.resolve("data/processed/pipeline", `${citySlug}.run.json`);

const writeSummary = (summary: LaunchSummary): void => {
  const filePath = summaryPathForCity(summary.city);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
};

const summaryFromReceipt = (citySlug: string): LaunchSummary => {
  const receiptPath = receiptPathForCity(citySlug);
  const receipt = readJson<{
    city: string;
    candidates_found: number;
    canonical_venues_written: number;
    evidence_records_written: number;
    scores_written: number;
    status: "success" | "failed";
    error_message: string | null;
  }>(receiptPath);

  return {
    city: citySlug,
    discovery_candidates: receipt.candidates_found,
    canonical_venues: receipt.canonical_venues_written,
    evidence_artifacts: receipt.evidence_records_written,
    score_records: receipt.scores_written,
    status: receipt.status,
    ...(receipt.error_message ? { error_message: receipt.error_message } : {}),
  };
};

const run = async (): Promise<void> => {
  const { cities, limit, dryRun } = parseArgs(process.argv.slice(2));

  if (dryRun) {
    process.stdout.write(`Dry run. Cities: ${cities.join(", ")}\n`);
    if (limit) {
      process.stdout.write(`Candidate limit override: ${limit}\n`);
    }
    return;
  }

  if (limit) {
    process.env.CITY_PIPELINE_MAX_CANDIDATES = String(limit);
    process.stdout.write(`Using candidate limit override: ${limit}\n`);
  }

  const summaries: LaunchSummary[] = [];
  const failures: LaunchSummary[] = [];

  for (const citySlug of cities) {
    process.stdout.write(`\n=== Running city pipeline: ${citySlug} ===\n`);

    try {
      await runCityPipeline(citySlug, false);
      const summary = summaryFromReceipt(citySlug);
      writeSummary(summary);
      summaries.push(summary);
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

      if (summary.status === "failed") {
        failures.push(summary);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedSummary: LaunchSummary = {
        city: citySlug,
        discovery_candidates: 0,
        canonical_venues: 0,
        evidence_artifacts: 0,
        score_records: 0,
        status: "failed",
        error_message: message,
      };
      writeSummary(failedSummary);
      summaries.push(failedSummary);
      failures.push(failedSummary);
      process.stderr.write(`Pipeline failed for ${citySlug}: ${message}\n`);
    }
  }

  process.stdout.write("\n=== Launch population summary ===\n");
  process.stdout.write(`${JSON.stringify(summaries, null, 2)}\n`);

  if (failures.length > 0) {
    process.stderr.write(`\n${failures.length} city pipeline run(s) failed:\n`);
    failures.forEach((failure) => {
      process.stderr.write(`- ${failure.city}: ${failure.error_message ?? "unknown error"}\n`);
    });
    process.exitCode = 1;
  }
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
