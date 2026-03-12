import fs from "node:fs";
import path from "node:path";
import type { CanonicalVenue, ScoreRecord } from "../schema/models.ts";
import { resolveQuery } from "./resolveQuery.ts";
import { filterVenues } from "./filterVenues.ts";
import { rankSearchResults, type SearchResult, type ReviewEvidenceArtifactMap } from "./rankSearchResults.ts";

export type SearchVenueResponse = {
  query: string;
  intent: ReturnType<typeof resolveQuery>;
  fallback_applied: boolean;
  fallback_note?: string;
  results: Array<{
    venue_id: string;
    name: string;
    city: string;
    neighborhood?: string;
    borough?: string;
    primary_category: CanonicalVenue["primary_category"];
    score: number;
    website?: string;
    search_tags: string[];
    reasons: string[];
  }>;
};

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;

const loadCanonicalVenues = (): CanonicalVenue[] => {
  const dir = path.resolve("data/processed/venues");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".canonical.json"))
    .map((file) => readJson<CanonicalVenue>(path.join(dir, file)));
};

const loadScores = (): Map<string, ScoreRecord> => {
  const dir = path.resolve("data/processed/scores");
  const scores = new Map<string, ScoreRecord>();
  if (!fs.existsSync(dir)) return scores;

  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".score.json"))) {
    const score = readJson<ScoreRecord>(path.join(dir, file));
    scores.set(score.venue_id, score);
  }

  return scores;
};

const loadReviewEvidence = (): ReviewEvidenceArtifactMap => {
  const dir = path.resolve("data/processed/evidence");
  const out: ReviewEvidenceArtifactMap = {};
  if (!fs.existsSync(dir)) return out;

  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".reviews.evidence.json"))) {
    const artifact = readJson<{ venue_id: string; source: string; review_count: number; signals: Array<{ signal: string; sentiment: number; confidence: number; evidence: string }> }>(path.join(dir, file));
    out[artifact.venue_id] = artifact;
  }

  return out;
};

const toResultShape = (ranked: SearchResult[], venueMap: Map<string, CanonicalVenue>) => ranked.map((row) => {
  const venue = venueMap.get(row.venue_slug);
  if (!venue) {
    return {
      venue_id: row.venue_slug,
      name: row.venue,
      city: "",
      primary_category: "Neighborhood Spa" as const,
      score: row.score,
      search_tags: [],
      reasons: row.reasons,
    };
  }

  return {
    venue_id: venue.id,
    name: venue.name,
    city: venue.city,
    neighborhood: venue.search_facets.neighborhood,
    borough: venue.search_facets.borough,
    primary_category: venue.primary_category,
    score: row.score,
    website: venue.website,
    search_tags: venue.search_tags,
    reasons: row.reasons,
  };
});

const withFallbackLocation = (intent: ReturnType<typeof resolveQuery>, step: "drop-neighborhood" | "drop-borough") => {
  if (step === "drop-neighborhood") {
    if (!intent.location.neighborhood) return intent;
    return {
      ...intent,
      location: {
        ...intent.location,
        neighborhood: undefined,
      },
    };
  }

  if (!intent.location.borough) return intent;

  return {
    ...intent,
    location: {
      ...intent.location,
      borough: undefined,
      neighborhood: undefined,
      city: intent.location.city ?? "new-york",
    },
  };
};

const humanizeLocation = (value: string): string => value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const createFallbackNote = (intent: ReturnType<typeof resolveQuery>, fallbackIntent: ReturnType<typeof resolveQuery>): string => {
  const facet = intent.required_facets.has_cold_plunge
    ? "cold plunge"
    : intent.required_facets.has_sauna
      ? "sauna"
      : "wellness";

  const fromScope = humanizeLocation(intent.location.neighborhood ?? intent.location.borough ?? intent.location.city ?? "requested area");
  const toScope = humanizeLocation(fallbackIntent.location.borough ?? fallbackIntent.location.city ?? "nearby areas");

  return `No exact ${fromScope} matches found. Showing best ${facet} venues in ${toScope}.`;
};

export const searchVenues = (query: string, limit = 20): SearchVenueResponse => {
  const intent = resolveQuery(query);
  const venues = loadCanonicalVenues();

  const scores = loadScores();
  const reviewEvidence = loadReviewEvidence();
  const venueMap = new Map(venues.map((venue) => [venue.slug, venue]));

  const runRanking = (candidateIntent: ReturnType<typeof resolveQuery>) => {
    const filtered = filterVenues(venues, candidateIntent);
    return rankSearchResults(filtered, candidateIntent, { scores, reviewEvidence }).slice(0, Math.max(0, limit));
  };

  const initial = runRanking(intent);
  if (initial.length > 0) {
    return {
      query,
      intent,
      fallback_applied: false,
      results: toResultShape(initial, venueMap),
    };
  }

  if (!intent.location.neighborhood && !intent.location.borough) {
    return {
      query,
      intent,
      fallback_applied: false,
      results: [],
    };
  }

  const neighborhoodRelaxedIntent = withFallbackLocation(intent, "drop-neighborhood");
  const neighborhoodRelaxed = runRanking(neighborhoodRelaxedIntent);
  if (neighborhoodRelaxed.length > 0 && neighborhoodRelaxedIntent !== intent) {
    return {
      query,
      intent,
      fallback_applied: true,
      fallback_note: createFallbackNote(intent, neighborhoodRelaxedIntent),
      results: toResultShape(neighborhoodRelaxed, venueMap),
    };
  }

  const boroughRelaxedIntent = withFallbackLocation(neighborhoodRelaxedIntent, "drop-borough");
  const boroughRelaxed = runRanking(boroughRelaxedIntent);
  if (boroughRelaxed.length > 0 && boroughRelaxedIntent !== neighborhoodRelaxedIntent) {
    return {
      query,
      intent,
      fallback_applied: true,
      fallback_note: createFallbackNote(intent, boroughRelaxedIntent),
      results: toResultShape(boroughRelaxed, venueMap),
    };
  }
 return {
    query,
    intent,
    fallback_applied: false,
    results: [],
  };
};
