import fs from "node:fs";
import path from "node:path";
import type { CanonicalVenue, ScoreRecord } from "../schema/models.ts";
import { resolveQuery } from "./resolveQuery.ts";
import { filterVenues } from "./filterVenues.ts";
import { rankSearchResults, type SearchResult, type ReviewEvidenceArtifactMap } from "./rankSearchResults.ts";

export type SearchVenueResponse = {
  query: string;
  intent: ReturnType<typeof resolveQuery>;
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

export const searchVenues = (query: string, limit = 20): SearchVenueResponse => {
  const intent = resolveQuery(query);
  const venues = loadCanonicalVenues();
  const filtered = filterVenues(venues, intent);

  const scores = loadScores();
  const reviewEvidence = loadReviewEvidence();
  const ranked = rankSearchResults(filtered, intent, { scores, reviewEvidence }).slice(0, Math.max(0, limit));

  const venueMap = new Map(venues.map((venue) => [venue.slug, venue]));

  return {
    query,
    intent,
    results: toResultShape(ranked, venueMap),
  };
};
