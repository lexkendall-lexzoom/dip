import type { CanonicalVenue, ScoreRecord } from "../schema/models.ts";

export type RankingFilter = {
  category?: string;
  bathing_style?: CanonicalVenue["bathing_style"];
  feature?: string;
  primary_category?: CanonicalVenue["primary_category"];
  search_tag?: string;
  facet?: keyof CanonicalVenue["search_facets"];
  facet_value?: boolean;
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
    if (filters.bathing_style && venue.bathing_style !== filters.bathing_style) return false;
    if (filters.feature && !venue.features.includes(filters.feature)) return false;
    if (filters.primary_category && venue.primary_category !== filters.primary_category) return false;
    if (filters.search_tag && !venue.search_tags.includes(filters.search_tag)) return false;

    if (filters.facet) {
      const expected = filters.facet_value ?? true;
      const facetValue = venue.search_facets[filters.facet];
      if (typeof facetValue === "boolean" && facetValue !== expected) return false;
      if (typeof facetValue !== "boolean" && expected) return false;
    }

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
  return rankVenues(venues, scores, { primary_category: "Social Sauna" }, limit);
}

export function getBestContrastTherapyVenues(venues: CanonicalVenue[], scores: ScoreRecord[], limit = 20): RankedVenue[] {
  return rankVenues(venues, scores, { facet: "has_cold_plunge", facet_value: true }, limit);
}
