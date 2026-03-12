import type { CanonicalVenue, SearchFacets } from "../schema/models.ts";
import type { QueryIntent } from "./resolveQuery.ts";
import type { ReviewEvidenceArtifact } from "./rankSearchResults.ts";

const POSITIVE_SIGNAL_REASONS: Record<string, string> = {
  ritual_quality: "Strong ritual quality signals",
  cold_plunge_quality: "Strong cold plunge quality signals",
  cold_plunge_access: "Positive cold plunge access signals",
  sauna_quality: "Strong sauna quality signals",
  thermal_circuit_quality: "Strong thermal circuit signals",
  staff_friendliness: "Positive staff friendliness signals",
  cleanliness: "Positive cleanliness signals",
  design_ambience: "Strong design and ambience signals",
  facility_condition: "Strong facility condition signals",
};

const FACET_REASON_LABELS: Partial<Record<keyof SearchFacets, string>> = {
  has_sauna: "Has sauna",
  has_cold_plunge: "Has cold plunge",
  has_steam_room: "Has steam room",
  has_hot_pool: "Has hot pool",
  has_thermal_circuit: "Has thermal circuit",
  has_guided_rituals: "Offers guided rituals",
  has_breathwork: "Offers breathwork",
  has_massages: "Offers massage",
  has_hyperbaric: "Has hyperbaric",
  has_iv_therapy: "Has IV therapy",
  has_cryotherapy: "Has cryotherapy",
  has_red_light: "Has red light",
};

const toTitle = (value: string): string => value.split("-").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");

const formatLocationReason = (venue: CanonicalVenue, intent: QueryIntent): string | null => {
  if (intent.location.neighborhood && venue.search_facets.neighborhood?.toLowerCase() === intent.location.neighborhood) {
    return `Located in ${venue.search_facets.neighborhood}`;
  }
  if (intent.location.borough && venue.search_facets.borough?.toLowerCase() === intent.location.borough) {
    return `Located in ${venue.search_facets.borough}`;
  }
  if (intent.location.city && venue.city.toLowerCase().replace(/\s+/g, "-") === intent.location.city) {
    return `Located in ${venue.city}`;
  }
  return null;
};

const formatFacetReason = (intent: QueryIntent, venue: CanonicalVenue): string | null => {
  const matches = Object.entries(intent.required_facets)
    .filter(([facet, required]) => required && (venue.search_facets as Record<string, unknown>)[facet] === true)
    .map(([facet]) => FACET_REASON_LABELS[facet as keyof SearchFacets] ?? `Has ${facet.replace(/^has_/, "").replace(/_/g, " ")}`);

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0] ?? null;
  return `${matches.slice(0, 2).join(" and ")}`;
};

const formatCategoryReason = (intent: QueryIntent, venue: CanonicalVenue): string | null => {
  if (!intent.preferred_category || venue.primary_category !== intent.preferred_category) return null;
  return `Matches ${intent.preferred_category.toLowerCase()} archetype`;
};

const formatTagReason = (intent: QueryIntent, venue: CanonicalVenue): string | null => {
  if (!intent.preferred_tags.length) return null;
  const tags = new Set(venue.search_tags.map((tag) => tag.toLowerCase()));
  const matched = intent.preferred_tags.filter((tag) => tags.has(tag.toLowerCase()));
  if (!matched.length) return null;
  if (matched.length === 1) return `Matches ${toTitle(matched[0] ?? "")} vibe`;
  return `Matches ${toTitle(matched[0] ?? "")} and ${toTitle(matched[1] ?? "")} vibes`;
};

const formatEvidenceReasons = (reviewArtifact: ReviewEvidenceArtifact | null): string[] => {
  if (!reviewArtifact?.signals?.length) return [];

  return reviewArtifact.signals
    .filter((signal) => signal.sentiment >= 0.35 && signal.confidence >= 0.55)
    .sort((a, b) => (b.confidence * b.sentiment) - (a.confidence * a.sentiment))
    .map((signal) => POSITIVE_SIGNAL_REASONS[signal.signal])
    .filter((reason): reason is string => Boolean(reason));
};

export const buildMatchReasons = (params: {
  venue: CanonicalVenue;
  intent: QueryIntent;
  reviewArtifact?: ReviewEvidenceArtifact | null;
  boostReasons?: string[];
  maxReasons?: number;
}): string[] => {
  const { venue, intent, reviewArtifact, boostReasons = [], maxReasons = 5 } = params;
  const reasons: string[] = [];

  const categoryReason = formatCategoryReason(intent, venue);
  if (categoryReason) reasons.push(categoryReason);

  const facetReason = formatFacetReason(intent, venue);
  if (facetReason) reasons.push(facetReason);

  const locationReason = formatLocationReason(venue, intent);
  if (locationReason) reasons.push(locationReason);

  const tagReason = formatTagReason(intent, venue);
  if (tagReason) reasons.push(tagReason);

  reasons.push(...formatEvidenceReasons(reviewArtifact));

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const reason of reasons) {
    const key = reason.toLowerCase();
    if (!reason || seen.has(key)) continue;
    seen.add(key);
    deduped.push(reason);
    if (deduped.length >= maxReasons) break;
  }

  return deduped.length > 0 ? deduped : ["Matches your search filters"];
};
