import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CanonicalVenue } from "../../lib/schema/models.ts";

type AuditIssue = {
  venue_id: string;
  slug: string;
  city: string;
  missing: string[];
};

type AuditSummary = {
  generated_at: string;
  city_slugs: string[];
  totals: {
    venues: number;
    ready: number;
    not_ready: number;
  };
  by_city: Record<string, { venues: number; ready: number; not_ready: number }>;
  issues: AuditIssue[];
};

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;

const toSlug = (value: string): string => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const parseArgs = (args: string[]): { citySlugs: string[] } => {
  const citySlugs = args.filter((arg) => !arg.startsWith("--"));
  return {
    citySlugs: citySlugs.length > 0
      ? citySlugs
      : ["new-york", "san-francisco", "los-angeles", "miami", "chicago"],
  };
};

export function runAuditSearchReadinessMain(args: string[]): void {
  const parsedArgs = parseArgs(args);
  const summary = auditSearchReadiness(parsedArgs.citySlugs);
  process.stdout.write(`search-ready venues: ${summary.totals.ready}/${summary.totals.venues}\n`);
  process.stdout.write(`issues: ${summary.totals.not_ready}\n`);
}

const listCanonical = (): CanonicalVenue[] => {
  const directory = path.resolve("data/processed/venues");
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((file) => file.endsWith(".canonical.json"))
    .map((file) => readJson<CanonicalVenue>(path.join(directory, file)));
};

const hasTruthyString = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;

const validateVenue = (venue: CanonicalVenue): string[] => {
  const missing: string[] = [];

  if (!hasTruthyString(venue.primary_category)) missing.push("primary_category");
  if (!Array.isArray(venue.search_tags) || venue.search_tags.length === 0) missing.push("search_tags");

  if (!venue.search_facets || typeof venue.search_facets !== "object") {
    missing.push("search_facets");
  }

  if (!hasTruthyString(venue.city)) missing.push("city");
  if (!hasTruthyString(venue.country)) missing.push("country");

  if (!venue.coordinates || Number(venue.coordinates.lat) === 0 || Number(venue.coordinates.lng) === 0) {
    missing.push("coordinates_non_zero");
  }

  const scorePath = path.resolve("data/processed/scores", `${venue.id}.score.json`);
  if (!fs.existsSync(scorePath)) {
    missing.push("score_artifact");
  }

  return missing;
};

export function auditSearchReadiness(citySlugs: string[]): AuditSummary {
  const citySet = new Set(citySlugs);
  const venues = listCanonical().filter((venue) => citySet.has(toSlug(venue.city)) || citySlugs.some((city) => venue.slug.endsWith(`-${city}`)));

  const summary: AuditSummary = {
    generated_at: new Date().toISOString(),
    city_slugs: citySlugs,
    totals: {
      venues: venues.length,
      ready: 0,
      not_ready: 0,
    },
    by_city: {},
    issues: [],
  };

  for (const venue of venues) {
    const citySlug = toSlug(venue.city);
    if (!summary.by_city[citySlug]) {
      summary.by_city[citySlug] = { venues: 0, ready: 0, not_ready: 0 };
    }

    summary.by_city[citySlug].venues += 1;
    const missing = validateVenue(venue);

    if (missing.length === 0) {
      summary.totals.ready += 1;
      summary.by_city[citySlug].ready += 1;
    } else {
      summary.totals.not_ready += 1;
      summary.by_city[citySlug].not_ready += 1;
      summary.issues.push({
        venue_id: venue.id,
        slug: venue.slug,
        city: venue.city,
        missing,
      });
    }
  }

  summary.issues.sort((a, b) => `${a.city}:${a.slug}`.localeCompare(`${b.city}:${b.slug}`));

  const outputPath = path.resolve("data/review/search-readiness", "venues.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  return summary;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  runAuditSearchReadinessMain(process.argv.slice(2));
}
