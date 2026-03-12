import type { CanonicalVenue } from "../schema/models.ts";
import type { QueryIntent } from "./resolveQuery.ts";

const norm = (value: string | undefined): string => (value ?? "").toLowerCase().trim();

export const filterVenues = (venues: CanonicalVenue[], queryIntent: QueryIntent): CanonicalVenue[] => {
  return venues.filter((venue) => {
    if (queryIntent.location.city && norm(venue.city).replace(/\s+/g, "-") !== queryIntent.location.city) {
      return false;
    }

    if (queryIntent.location.borough && norm(venue.search_facets.borough) !== queryIntent.location.borough) {
      return false;
    }

    if (queryIntent.location.neighborhood && norm(venue.search_facets.neighborhood) !== queryIntent.location.neighborhood) {
      return false;
    }

    for (const [facet, required] of Object.entries(queryIntent.required_facets)) {
      if (!required) continue;
      if ((venue.search_facets as Record<string, unknown>)[facet] !== true) {
        return false;
      }
    }

    if (queryIntent.preferred_category && venue.primary_category !== queryIntent.preferred_category) {
      return false;
    }

    if (queryIntent.preferred_tags.length > 0) {
      const venueTags = new Set(venue.search_tags.map((tag) => tag.toLowerCase()));
      for (const tag of queryIntent.preferred_tags) {
        if (!venueTags.has(tag.toLowerCase())) {
          return false;
        }
      }
    }

    return true;
  });
};
