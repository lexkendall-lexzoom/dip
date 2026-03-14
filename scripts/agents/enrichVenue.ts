import type { VenueCandidate } from "./discoverVenues.ts";
import { uniqueStrings } from "./helpers.ts";

export type EnrichedVenue = {
  name: string;
  city: string;
  region?: string;
  country?: string;
  neighborhood?: string;
  address?: string;
  website_url?: string;
  booking_url?: string;
  instagram_url?: string;
  short_description?: string;
  long_description?: string;
  amenities?: string[];
  rituals?: string[];
  hours?: string;
  hero_image?: string;
  gallery?: string[];
  source_urls?: string[];
  slug?: string;
};

const sanitizeMaybeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export async function enrichVenue(candidate: VenueCandidate): Promise<EnrichedVenue> {
  // First pass keeps enrichment conservative and deterministic.
  // If future enrichers fetch remote metadata, keep provenance in source_urls.
  const website = sanitizeMaybeString(candidate.website_url);

  return {
    name: candidate.name.trim(),
    city: candidate.city.trim(),
    region: sanitizeMaybeString(candidate.region),
    country: sanitizeMaybeString(candidate.country),
    address: sanitizeMaybeString(candidate.address),
    website_url: website,
    source_urls: uniqueStrings([...(candidate.source_urls ?? []), website]),
  };
}
