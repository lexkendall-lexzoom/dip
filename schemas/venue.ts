import {
  BATHING_STYLES,
  PRIMARY_CATEGORIES,
  type BathingStyle,
  type PrimaryCategory,
} from "../lib/schema/models.ts";

export type VenueSchema = {
  category: PrimaryCategory;
  bathing_style: BathingStyle;
};

export const validateVenueTaxonomy = (venue: Partial<VenueSchema>): VenueSchema => {
  if (!venue.category || !PRIMARY_CATEGORIES.includes(venue.category)) {
    throw new Error(`Invalid category: ${String(venue.category)}`);
  }
  if (!venue.bathing_style || !BATHING_STYLES.includes(venue.bathing_style)) {
    throw new Error(`Invalid bathing_style: ${String(venue.bathing_style)}`);
  }

  return {
    category: venue.category,
    bathing_style: venue.bathing_style,
  };
};
