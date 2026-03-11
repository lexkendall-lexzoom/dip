import type { CanonicalVenue, ScoreRecord } from "../schema/models.ts";

export type RankingFilter = {
  category?: string;
  feature?: string;
  city?: string;
  country?: string;
  ranking_eligible?: boolean;
  min_confidence?: number;
};

export type RankedVenue = {
  venue: CanonicalVenue;
  score: ScoreRecord;
};

const applyFilters = (rows: RankedVenue[], filters: RankingFilter = {}): RankedVenue[] =>
  rows.filter(({ venue, score }) => {
    if (filters.category && !venue.categories.includes(filters.category)) return false;
    if (filters.feature && !venue.features.includes(filters.feature)) return false;
    if (filters.city && venue.city !== filters.city) return false;
    if (filters.country && venue.country !== filters.country) return false;
    if (filters.ranking_eligible !== undefined && score.ranking_eligible !== filters.ranking_eligible) return false;
    if (filters.min_confidence !== undefined && score.confidence_score < filters.min_confidence) return false;
    return true;
  });

const compareRanked = (a: RankedVenue, b: RankedVenue): number => {
  if (b.score.overall !== a.score.overall) return b.score.overall - a.score.overall;
  if (b.score.confidence_score !== a.score.confidence_score) return b.score.confidence_score - a.score.confidence_score;
  if (b.score.coverage_score !== a.score.coverage_score) return b.score.coverage_score - a.score.coverage_score;

  const aReviewCount = a.score.scoring_metadata?.review_count ?? 0;
  const bReviewCount = b.score.scoring_metadata?.review_count ?? 0;
  if (bReviewCount !== aReviewCount) return bReviewCount - aReviewCount;

  return a.venue.slug.localeCompare(b.venue.slug);
};

const buildRows = (venues: CanonicalVenue[], scores: ScoreRecord[]): RankedVenue[] => {
  const scoreMap = new Map(scores.map((score) => [score.venue_id, score]));

  return venues
    .map((venue) => {
      const score = scoreMap.get(venue.id);
      if (!score) return null;
      return { venue, score };
    })
    .filter((row): row is RankedVenue => Boolean(row));
};

export function rankVenues(
  venues: CanonicalVenue[],
  scores: ScoreRecord[],
  filters: RankingFilter = {},
  limit = 20
): RankedVenue[] {
  const defaultFilters: RankingFilter = {
    ranking_eligible: true,
    ...filters,
  };

  return applyFilters(buildRows(venues, scores), defaultFilters).sort(compareRanked).slice(0, limit);
}

export function getTopBathhousesWorldwide(venues: CanonicalVenue[], scores: ScoreRecord[], limit = 20): RankedVenue[] {
  return rankVenues(venues, scores, {}, limit);
}

export function getBestSocialSaunas(venues: CanonicalVenue[], scores: ScoreRecord[], limit = 20): RankedVenue[] {
  return rankVenues(venues, scores, { category: "Social Sauna" }, limit);
}

export function getBestContrastTherapyVenues(venues: CanonicalVenue[], scores: ScoreRecord[], limit = 20): RankedVenue[] {
  return rankVenues(venues, scores, { category: "Contrast Therapy" }, limit);
}
