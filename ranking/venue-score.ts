import { rankVenues, type RankingFilter } from "../lib/ranking/rankings.ts";
import type { CanonicalVenue, ScoreRecord } from "../lib/schema/models.ts";

export type VenueScoreFilter = Pick<RankingFilter, "category" | "bathing_style">;

export const scoreVenues = (
  venues: CanonicalVenue[],
  scores: ScoreRecord[],
  filters: VenueScoreFilter = {}
) => rankVenues(venues, scores, filters);
