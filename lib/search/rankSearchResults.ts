import fs from "node:fs";
import path from "node:path";
import type { CanonicalVenue, ScoreRecord } from "../schema/models.ts";
import type { QueryIntent } from "./resolveQuery.ts";

export type SearchResult = {
  venue: string;
  venue_slug: string;
  score: number;
  reasons: string[];
};

export type ReviewEvidenceArtifact = {
  venue_id: string;
  source: string;
  review_count: number;
  signals: Array<{ signal: string; sentiment: number; confidence: number; evidence: string }>;
};

const readJson = <T>(p: string): T => JSON.parse(fs.readFileSync(p, "utf8")) as T;


export type ReviewEvidenceArtifactMap = Record<string, ReviewEvidenceArtifact>;

type RankSearchOptions = {
  scores?: Map<string, ScoreRecord>;
  reviewEvidence?: ReviewEvidenceArtifactMap;
};

const loadScores = (): Map<string, ScoreRecord> => {
  const dir = path.resolve("data/processed/scores");
  const scores = new Map<string, ScoreRecord>();
  if (!fs.existsSync(dir)) return scores;

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".score.json"))) {
    const score = readJson<ScoreRecord>(path.join(dir, file));
    scores.set(score.venue_id, score);
  }

  return scores;
};

const reviewConfidence = (venueSlug: string, reviewEvidence?: ReviewEvidenceArtifactMap): number => {
  if (reviewEvidence) {
    const inline = reviewEvidence[venueSlug];
    if (!inline || !inline.signals.length) return 0;
    const inlineTotal = inline.signals.reduce((sum, signal) => sum + signal.confidence, 0);
    return Number((inlineTotal / inline.signals.length).toFixed(4));
  }

  const file = path.resolve("data/processed/evidence", `${venueSlug}.reviews.evidence.json`);
  if (!fs.existsSync(file)) return 0;
  const artifact = readJson<ReviewEvidenceArtifact>(file);
  if (!artifact.signals.length) return 0;
  const total = artifact.signals.reduce((sum, signal) => sum + signal.confidence, 0);
  return Number((total / artifact.signals.length).toFixed(4));
};

const facilityCompleteness = (venue: CanonicalVenue): number => {
  const values = Object.entries(venue.search_facets)
    .filter(([key]) => key.startsWith("has_"))
    .map(([, value]) => Boolean(value));
  if (values.length === 0) return 0;
  return Number((values.filter(Boolean).length / values.length).toFixed(4));
};

const buildReasons = (venue: CanonicalVenue, intent: QueryIntent): string[] => {
  const reasons: string[] = [];

  if (intent.preferred_category && venue.primary_category === intent.preferred_category) {
    reasons.push(`Matches ${intent.preferred_category.toLowerCase()} archetype`);
  }

  const matchedFacets = Object.entries(intent.required_facets)
    .filter(([key, value]) => value && (venue.search_facets as Record<string, unknown>)[key] === true)
    .map(([key]) => key.replace(/^has_/, "").replace(/_/g, " "));
  if (matchedFacets.length > 0) {
    reasons.push(`Has ${matchedFacets.join(" and ")}`);
  }

  if (intent.location.borough && venue.search_facets.borough?.toLowerCase() === intent.location.borough) {
    reasons.push(`Located in ${venue.search_facets.borough}`);
  } else if (intent.location.neighborhood && venue.search_facets.neighborhood?.toLowerCase() === intent.location.neighborhood) {
    reasons.push(`Located in ${venue.search_facets.neighborhood}`);
  } else if (intent.location.city && venue.city.toLowerCase().replace(/\s+/g, "-") === intent.location.city) {
    reasons.push(`Located in ${venue.city}`);
  }

  if (reasons.length === 0) {
    reasons.push("Matched structured search filters");
  }

  return reasons;
};

export const rankSearchResults = (filteredVenues: CanonicalVenue[], intent: QueryIntent, options: RankSearchOptions = {}): SearchResult[] => {
  const scores = options.scores ?? loadScores();

  return [...filteredVenues]
    .sort((a, b) => {
      const scoreA = scores.get(a.id)?.overall ?? 0;
      const scoreB = scores.get(b.id)?.overall ?? 0;
      if (scoreA !== scoreB) return scoreB - scoreA;

      const reviewA = reviewConfidence(a.slug, options.reviewEvidence);
      const reviewB = reviewConfidence(b.slug, options.reviewEvidence);
      if (reviewA !== reviewB) return reviewB - reviewA;

      const facilityA = facilityCompleteness(a);
      const facilityB = facilityCompleteness(b);
      if (facilityA !== facilityB) return facilityB - facilityA;

      return a.slug.localeCompare(b.slug);
    })
    .map((venue) => ({
      venue: venue.name,
      venue_slug: venue.slug,
      score: Number((scores.get(venue.id)?.overall ?? 0).toFixed(2)),
      reasons: buildReasons(venue, intent),
    }));
};
