import type { CanonicalVenue } from "../schema/models.ts";
import { filterVenues } from "./filterVenues.ts";
import { loadSearchData } from "./loadSearchData.ts";
import { rankSearchResults, type SearchResult } from "./rankSearchResults.ts";
import { resolveQuery } from "./resolveQuery.ts";

export type SearchVenueResponse = {
  query: string;
  intent: ReturnType<typeof resolveQuery>;
  fallback_applied: boolean;
  fallback_note?: string;
  results: Array<{
    venue_id: string;
    name: string;
    city: string;
    neighborhood?: string;
    borough?: string;
    primary_category: CanonicalVenue["primary_category"];
    score: number;
    website?: string;
    search_tags: string[];
    reasons: string[];
  }>;
};

const toResultShape = (ranked: SearchResult[], venueMap: Map<string, CanonicalVenue>) => ranked.map((row) => {
  const venue = venueMap.get(row.venue_slug);
  if (!venue) {
    return {
      venue_id: row.venue_slug,
      name: row.venue,
      city: "",
      primary_category: "Neighborhood Spa" as const,
      score: row.score,
      search_tags: [],
      reasons: row.reasons,
    };
  }

  return {
    venue_id: venue.id,
    name: venue.name,
    city: venue.city,
    neighborhood: venue.search_facets.neighborhood,
    borough: venue.search_facets.borough,
    primary_category: venue.primary_category,
    score: row.score,
    website: venue.website,
    search_tags: venue.search_tags,
    reasons: row.reasons,
  };
});

const withFallbackLocation = (intent: ReturnType<typeof resolveQuery>, step: "drop-neighborhood" | "drop-borough") => {
  if (step === "drop-neighborhood") {
    if (!intent.location.neighborhood) return intent;
    return {
      ...intent,
      location: {
        ...intent.location,
        neighborhood: undefined,
      },
    };
  }

  if (!intent.location.borough) return intent;

  return {
    ...intent,
    location: {
      ...intent.location,
      borough: undefined,
      neighborhood: undefined,
      city: intent.location.city ?? "new-york",
    },
  };
};

const humanizeLocation = (value: string): string => value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const createFallbackNote = (intent: ReturnType<typeof resolveQuery>, fallbackIntent: ReturnType<typeof resolveQuery>): string => {
  const facet = intent.required_facets.has_cold_plunge
    ? "cold plunge"
    : intent.required_facets.has_sauna
      ? "sauna"
      : "wellness";

  const fromScope = humanizeLocation(intent.location.neighborhood ?? intent.location.borough ?? intent.location.city ?? "requested area");
  const toScope = humanizeLocation(fallbackIntent.location.borough ?? fallbackIntent.location.city ?? "nearby areas");

  return `No exact ${fromScope} matches found. Showing best ${facet} venues in ${toScope}.`;
};

export const searchVenues = (query: string, limit = 20): SearchVenueResponse => {
  const intent = resolveQuery(query);
  const { venues, scores, reviewEvidence, diagnostics } = loadSearchData();

  console.info("[search] dataset loaded", diagnostics);

  const venueMap = new Map(venues.map((venue) => [venue.slug, venue]));

  const runRanking = (candidateIntent: ReturnType<typeof resolveQuery>) => {
    const filtered = filterVenues(venues, candidateIntent);
    return rankSearchResults(filtered, candidateIntent, { scores, reviewEvidence }).slice(0, Math.max(0, limit));
  };

  const initial = runRanking(intent);
  if (initial.length > 0) {
    return {
      query,
      intent,
      fallback_applied: false,
      results: toResultShape(initial, venueMap),
    };
  }

  if (!intent.location.neighborhood && !intent.location.borough) {
    return {
      query,
      intent,
      fallback_applied: false,
      results: [],
    };
  }

  const neighborhoodRelaxedIntent = withFallbackLocation(intent, "drop-neighborhood");
  const neighborhoodRelaxed = runRanking(neighborhoodRelaxedIntent);
  if (neighborhoodRelaxed.length > 0 && neighborhoodRelaxedIntent !== intent) {
    return {
      query,
      intent,
      fallback_applied: true,
      fallback_note: createFallbackNote(intent, neighborhoodRelaxedIntent),
      results: toResultShape(neighborhoodRelaxed, venueMap),
    };
  }

  const boroughRelaxedIntent = withFallbackLocation(neighborhoodRelaxedIntent, "drop-borough");
  const boroughRelaxed = runRanking(boroughRelaxedIntent);
  if (boroughRelaxed.length > 0 && boroughRelaxedIntent !== neighborhoodRelaxedIntent) {
    return {
      query,
      intent,
      fallback_applied: true,
      fallback_note: createFallbackNote(intent, boroughRelaxedIntent),
      results: toResultShape(boroughRelaxed, venueMap),
    };
  }

  return {
    query,
    intent,
    fallback_applied: false,
    results: [],
  };
};
