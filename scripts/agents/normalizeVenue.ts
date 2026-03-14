import type { EnrichedVenue } from "./enrichVenue.ts";
import { slugify, uniqueStrings } from "./helpers.ts";

export type NormalizedVenueFile = {
  seo: {
    title: string;
    description: string;
    social_image: string;
  };
  venue: {
    name: string;
    slug: string;
    status: "draft";
    city: string;
    country: string;
    short_description: string;
    long_description?: string;
    neighborhood?: string;
    address?: string;
    website_url?: string;
    booking_url?: string;
    instagram_url?: string;
    primary_archetype: string;
    amenities?: string[];
    rituals?: string[];
    hours?: string;
    hero_image?: string;
    gallery_images?: string[];
    source_urls?: string[];
  };
};

export function normalizeVenue(enrichedVenue: EnrichedVenue): NormalizedVenueFile {
  const slug = enrichedVenue.slug?.trim() || slugify(enrichedVenue.name);
  const citySlug = slugify(enrichedVenue.city);
  const impliedUsCities = new Set(["new-york-city", "los-angeles", "miami", "san-francisco", "chicago"]);
  const country = enrichedVenue.country?.trim() || (impliedUsCities.has(citySlug) ? "United States" : "");
  const shortDescription = enrichedVenue.short_description?.trim() || "Draft venue profile. Needs editorial review.";
  const longDescription = enrichedVenue.long_description?.trim() || "";
  const heroImage = enrichedVenue.hero_image?.trim() || "";

  return {
    seo: {
      title: enrichedVenue.name,
      description: shortDescription,
      social_image: heroImage,
    },
    venue: {
      name: enrichedVenue.name,
      slug,
      status: "draft",
      city: citySlug,
      country,
      short_description: shortDescription,
      long_description: longDescription,
      neighborhood: enrichedVenue.neighborhood,
      address: enrichedVenue.address,
      website_url: enrichedVenue.website_url,
      booking_url: enrichedVenue.booking_url,
      instagram_url: enrichedVenue.instagram_url,
      primary_archetype: "Other",
      amenities: enrichedVenue.amenities,
      rituals: enrichedVenue.rituals,
      hours: enrichedVenue.hours,
      hero_image: heroImage,
      gallery_images: uniqueStrings(enrichedVenue.gallery ?? []),
      source_urls: uniqueStrings(enrichedVenue.source_urls ?? []),
    },
  };
}
