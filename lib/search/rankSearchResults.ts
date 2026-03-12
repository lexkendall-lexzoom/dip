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

export type ReviewEvidenceArtifactMap = Record<string, ReviewEvidenceArtifact>;

type RankSearchOptions = {
  scores?: Map<string, ScoreRecord>;
  reviewEvidence?: ReviewEvidenceArtifactMap;
};

type BoostComputation = {
  amount: number;
  reasons: string[];
};

const getReviewArtifact = (venueSlug: string, reviewEvidence?: ReviewEvidenceArtifactMap): ReviewEvidenceArtifact | null => {
  if (!reviewEvidence) return null;
  return reviewEvidence[venueSlug] ?? null;
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
    }
  }

  if (weights.category_boosts[venue.primary_category]) {
    boost += weights.category_boosts[venue.primary_category] ?? 0;
    reasons.push(`${venue.primary_category} category match`);
  }

  const venueTags = new Set(venue.search_tags.map((tag) => tag.toLowerCase()));
  for (const [tag, tagBoost] of Object.entries(weights.tag_boosts)) {
    if (venueTags.has(tag.toLowerCase())) {
      boost += tagBoost;
      reasons.push(`${tag.replace(/-/g, " ")} tag match`);
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

export const rankSearchResults = (filteredVenues: CanonicalVenue[], intent: QueryIntent, options: RankSearchOptions = {}): SearchResult[] => {
  const scores = options.scores ?? new Map<string, ScoreRecord>();

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
      boost_breakdown: row.intentBoost.reasons,
    }));
};
