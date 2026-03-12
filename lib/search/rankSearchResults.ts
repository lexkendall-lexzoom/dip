import fs from "node:fs";
import path from "node:path";
import type { CanonicalVenue, ScoreRecord } from "../schema/models.ts";
import type { QueryIntent } from "./resolveQuery.ts";
import { deriveIntentWeights, hasMeaningfulIntent } from "./intentWeights.ts";
import { buildMatchReasons } from "./matchReasons.ts";

export type SearchResult = {
  venue: string;
  venue_slug: string;
  score: number;
  reasons: string[];
  boost_breakdown?: string[];
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

type BoostComputation = {
  amount: number;
  reasons: string[];
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

const getReviewArtifact = (venueSlug: string, reviewEvidence?: ReviewEvidenceArtifactMap): ReviewEvidenceArtifact | null => {
  if (reviewEvidence) return reviewEvidence[venueSlug] ?? null;

  const file = path.resolve("data/processed/evidence", `${venueSlug}.reviews.evidence.json`);
  if (!fs.existsSync(file)) return null;
  return readJson<ReviewEvidenceArtifact>(file);
};

const reviewConfidence = (venueSlug: string, reviewEvidence?: ReviewEvidenceArtifactMap): number => {
  const artifact = getReviewArtifact(venueSlug, reviewEvidence);
  if (!artifact || !artifact.signals.length) return 0;
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

const computeIntentBoost = (venue: CanonicalVenue, intent: QueryIntent, reviewEvidence?: ReviewEvidenceArtifactMap): BoostComputation => {
  if (!hasMeaningfulIntent(intent)) {
    return { amount: 0, reasons: [] };
  }

  const weights = deriveIntentWeights(intent);
  const reasons: string[] = [];
  let boost = 0;

  for (const [facetKey, facetBoost] of Object.entries(weights.facet_boosts)) {
    if ((venue.search_facets as Record<string, unknown>)[facetKey] === true) {
      boost += facetBoost ?? 0;
      reasons.push(`${facetKey.replace(/^has_/, "").replace(/_/g, " ")} intent match`);
      reasons.push(`Boosted for ${facetKey.replace(/^has_/, "").replace(/_/g, " ")}`);
    }
  }

  if (weights.category_boosts[venue.primary_category]) {
    boost += weights.category_boosts[venue.primary_category] ?? 0;
    reasons.push(`${venue.primary_category} category match`);
    reasons.push(`Boosted for ${venue.primary_category.toLowerCase()} category match`);
  }

  const venueTags = new Set(venue.search_tags.map((tag) => tag.toLowerCase()));
  for (const [tag, tagBoost] of Object.entries(weights.tag_boosts)) {
    if (venueTags.has(tag.toLowerCase())) {
      boost += tagBoost;
      reasons.push(`${tag.replace(/-/g, " ")} tag match`);
      reasons.push(`Boosted for ${tag} tag match`);
    }
  }

  const artifact = getReviewArtifact(venue.slug, reviewEvidence);
  if (artifact && artifact.signals.length > 0) {
    for (const signal of artifact.signals) {
      const signalWeight = weights.signal_weights[signal.signal];
      if (!signalWeight) continue;
      const sentimentFactor = Math.max(0, (signal.sentiment + 1) / 2);
      const signalBoost = signalWeight * signal.confidence * sentimentFactor;
      if (signalBoost <= 0) continue;
      boost += signalBoost;
      reasons.push(`${signal.signal.replace(/_/g, " ")} evidence support`);
      reasons.push(`Boosted for ${signal.signal.replace(/_/g, " ")} evidence`);
    }
  }

  return {
    amount: Number(Math.min(weights.max_total_boost, boost).toFixed(4)),
    reasons,
  };
};

const buildReasons = (
  venue: CanonicalVenue,
  intent: QueryIntent,
  boostReasons: string[],
  reviewArtifact: ReviewEvidenceArtifact | null,
): string[] => buildMatchReasons({
  venue,
  intent,
  boostReasons,
  reviewArtifact,
  maxReasons: 5,
});
const buildReasons = (venue: CanonicalVenue, intent: QueryIntent, boostReasons: string[]): string[] => {
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

  if (boostReasons.length > 0) {
    reasons.push(...boostReasons.slice(0, 2));
  }

  if (reasons.length === 0) {
    reasons.push("Matched structured search filters");
  }

  return reasons;
};

export const rankSearchResults = (filteredVenues: CanonicalVenue[], intent: QueryIntent, options: RankSearchOptions = {}): SearchResult[] => {
  const scores = options.scores ?? loadScores();

  const scored = filteredVenues.map((venue) => {
    const baseScore = scores.get(venue.id)?.overall ?? 0;
    const intentBoost = computeIntentBoost(venue, intent, options.reviewEvidence);
    const finalSearchScore = Number((baseScore + intentBoost.amount).toFixed(4));

    return {
      venue,
      baseScore,
      finalSearchScore,
      intentBoost,
      reviewArtifact: getReviewArtifact(venue.slug, options.reviewEvidence),
      reviewConfidence: reviewConfidence(venue.slug, options.reviewEvidence),
      facilityCompleteness: facilityCompleteness(venue),
    };
  });

  return scored
    .sort((a, b) => {
      if (a.finalSearchScore !== b.finalSearchScore) return b.finalSearchScore - a.finalSearchScore;
      if (a.baseScore !== b.baseScore) return b.baseScore - a.baseScore;
      if (a.reviewConfidence !== b.reviewConfidence) return b.reviewConfidence - a.reviewConfidence;
      if (a.facilityCompleteness !== b.facilityCompleteness) return b.facilityCompleteness - a.facilityCompleteness;
      return a.venue.slug.localeCompare(b.venue.slug);
    })
    .map((row) => ({
      venue: row.venue.name,
      venue_slug: row.venue.slug,
      score: Number(row.finalSearchScore.toFixed(2)),
      reasons: buildReasons(row.venue, intent, row.intentBoost.reasons, row.reviewArtifact),
      reasons: buildReasons(row.venue, intent, row.intentBoost.reasons),
      boost_breakdown: row.intentBoost.reasons,
    }));
};
