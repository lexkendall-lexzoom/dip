import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { CandidateVenueRaw, CanonicalVenue } from "../../lib/schema/models.ts";
import { validateCanonicalVenue } from "../../lib/schema/validation.ts";
import type { AmbiguousDuplicate } from "../../lib/schema/canonicalization.ts";
import {
  areClearDuplicates,
  getAmbiguousDuplicate,
  normalizeWebsite,
  toCanonicalVenue,
} from "../../lib/schema/canonicalization.ts";

type DedupeReview = {
  city: string;
  generated_at: string;
  ambiguous_duplicates: AmbiguousDuplicate[];
};

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;

const loadExistingCanonicalVenues = (directoryPath: string): CanonicalVenue[] => {
  if (!fs.existsSync(directoryPath)) return [];

  return fs.readdirSync(directoryPath)
    .filter((fileName) => fileName.endsWith(".canonical.json"))
    .map((fileName) => readJson<CanonicalVenue>(path.join(directoryPath, fileName)));
};

const findExistingMatch = (candidate: CandidateVenueRaw, existing: CanonicalVenue[]): CanonicalVenue | undefined => {
  const normalizedCandidateWebsite = normalizeWebsite(candidate.website);

  return existing.find((venue) => {
    const websiteMatch = normalizedCandidateWebsite && normalizeWebsite(venue.website) === normalizedCandidateWebsite;
    if (websiteMatch) return true;

    return venue.name.toLowerCase().trim() === candidate.name.toLowerCase().trim()
      && venue.city.toLowerCase().trim() === candidate.city.toLowerCase().trim();
  });
};

const mergeClearDuplicates = (candidates: CandidateVenueRaw[]): CandidateVenueRaw[] => {
  const merged: CandidateVenueRaw[] = [];

  candidates.forEach((candidate) => {
    const existingIndex = merged.findIndex((current) => areClearDuplicates(current, candidate));
    if (existingIndex < 0) {
      merged.push(candidate);
      return;
    }

    const current = merged[existingIndex];
    merged[existingIndex] = {
      ...current,
      source_urls: Array.from(new Set([...current.source_urls, ...candidate.source_urls])),
      snippets: [...current.snippets, ...candidate.snippets],
      candidate_categories: Array.from(new Set([...current.candidate_categories, ...candidate.candidate_categories])),
      enrichment_sources: Array.from(new Set([...(current.enrichment_sources ?? []), ...(candidate.enrichment_sources ?? [])])),
      review_sources: Array.from(new Set([...(current.review_sources ?? []), ...(candidate.review_sources ?? [])])),
      source_provenance: [...current.source_provenance, ...candidate.source_provenance],
      website: current.website ?? candidate.website,
      address: current.address ?? candidate.address,
    };
  });

  return merged;
};

const collectAmbiguousDuplicates = (candidates: CandidateVenueRaw[]): AmbiguousDuplicate[] => {
  const ambiguous: AmbiguousDuplicate[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const possible = getAmbiguousDuplicate(candidates[i], candidates[j]);
      if (possible) ambiguous.push(possible);
    }
  }

  return ambiguous;
};

export function runCanonicalization(discoveryFilePath: string): { written: string[]; reviewPath: string } {
  const resolvedDiscoveryPath = path.resolve(discoveryFilePath);
  const citySlug = path.basename(resolvedDiscoveryPath, ".json");
  const rawCandidates = readJson<CandidateVenueRaw[]>(resolvedDiscoveryPath);

  const mergedCandidates = mergeClearDuplicates(rawCandidates);
  const ambiguousDuplicates = collectAmbiguousDuplicates(mergedCandidates);

  const venuesDirectory = path.resolve("data/processed/venues");
  const dedupeDirectory = path.resolve("data/processed/dedupe");
  fs.mkdirSync(venuesDirectory, { recursive: true });
  fs.mkdirSync(dedupeDirectory, { recursive: true });

  const existingCanonical = loadExistingCanonicalVenues(venuesDirectory);
  const written: string[] = [];

  mergedCandidates.forEach((candidate) => {
    const existing = findExistingMatch(candidate, existingCanonical);
    const canonicalVenue = toCanonicalVenue(candidate, existing);
    const validation = validateCanonicalVenue(canonicalVenue);

    if (!validation.valid) {
      throw new Error(`Invalid canonical venue ${canonicalVenue.slug}: ${validation.errors.join("; ")}`);
    }

    const outputPath = path.join(venuesDirectory, `${canonicalVenue.slug}.canonical.json`);
    fs.writeFileSync(outputPath, `${JSON.stringify(canonicalVenue, null, 2)}\n`, "utf8");
    written.push(outputPath);
  });

  const reviewPayload: DedupeReview = {
    city: mergedCandidates[0]?.city ?? citySlug,
    generated_at: new Date().toISOString(),
    ambiguous_duplicates: ambiguousDuplicates,
  };

  const reviewPath = path.join(dedupeDirectory, `${citySlug}.review.json`);
  fs.writeFileSync(reviewPath, `${JSON.stringify(reviewPayload, null, 2)}\n`, "utf8");

  return { written, reviewPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const [discoveryPath] = process.argv.slice(2);
  if (!discoveryPath) {
    throw new Error("Usage: node scripts/agents/runCanonicalization.ts <data/raw/discovery/{city}.json>");
  }

  const { written, reviewPath } = runCanonicalization(discoveryPath);
  process.stdout.write(`Wrote ${written.length} canonical venue files.\n`);
  process.stdout.write(`Wrote dedupe review file: ${reviewPath}\n`);
}
