import { classifyPrimaryCategory } from "../lib/schema/canonicalization.ts";
import { classifyBathingStyle } from "../lib/schema/bathingStyle.ts";
import type { CanonicalVenue } from "../lib/schema/models.ts";

type EnrichmentInput = Pick<CanonicalVenue, "name" | "categories" | "features" | "venue_type"> & Partial<CanonicalVenue>;

export const classifyVenue = (venue: EnrichmentInput): CanonicalVenue["category"] =>
  classifyPrimaryCategory({
    name: venue.name,
    categories: venue.categories,
    features: venue.features,
    venueType: venue.venue_type,
  });

export const enrichVenueTaxonomy = <T extends EnrichmentInput>(venue: T): T & Pick<CanonicalVenue, "category" | "bathing_style"> => {
  const category = classifyVenue(venue);
  const bathing_style = classifyBathingStyle(venue);

  return {
    ...venue,
    category,
    bathing_style,
  };
};
