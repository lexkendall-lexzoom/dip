import type {
  BathingStyle,
  CandidateVenueRaw,
  CanonicalVenue,
  PrimaryCategory,
  SearchFacets,
  VenueType,
} from "./models.ts";
import { createStableVenueId, isUuid } from "./identity.ts";
import { classifyBathingStyle } from "./bathingStyle.ts";

export type AmbiguousDuplicate = {
  city: string;
  candidate_a: Pick<CandidateVenueRaw, "name" | "website" | "address" | "source_urls">;
  candidate_b: Pick<CandidateVenueRaw, "name" | "website" | "address" | "source_urls">;
  reason: string;
  similarity_score: number;
};

const stripProtocol = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toKebab = (value: string): string =>
  normalizeText(value)
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");

export const createStableSlug = (name: string, city: string): string => {
  const base = `${normalizeText(name)} ${normalizeText(city)}`.trim();
  return base
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
};

export const normalizeWebsite = (website?: string): string | undefined => {
  if (!website) return undefined;
  return stripProtocol(website);
};

export const normalizeAddress = (address?: string): string | undefined => {
  if (!address) return undefined;
  return normalizeText(address);
};

export const normalizedName = (name: string): string => normalizeText(name);

const tokenSet = (value: string): Set<string> => new Set(normalizeText(value).split(" ").filter(Boolean));

const gatherSignals = (input: {
  name: string;
  categories: string[];
  features: string[];
  venueType: VenueType;
}): Set<string> => {
  const combined = [input.name, ...input.categories, ...input.features, input.venueType].join(" ");
  return tokenSet(combined);
};

const hasAnyToken = (signals: Set<string>, tokens: string[]): boolean => tokens.some((token) => signals.has(token));

export const classifyPrimaryCategory = (input: {
  name: string;
  categories: string[];
  features: string[];
  venueType: VenueType;
}): PrimaryCategory => {
  const signals = gatherSignals(input);
  const medicalCount = ["iv", "hyperbaric", "cryotherapy", "clinic", "recovery", "red", "light"].filter((t) => signals.has(t)).length;
  const bathhouseStrength = ["thermal", "pool", "bathhouse", "hammam", "circuit", "spa"].filter((t) => signals.has(t)).length;

  if (hasAnyToken(signals, ["banya", "venik", "platza"])) {
    return "Traditional Banya";
  }

  if (medicalCount >= 2 && hasAnyToken(signals, ["wellness", "recovery", "clinic", "studio", "social"])) {
    return "Social Wellness Club";
  }

  if (bathhouseStrength >= 2 && hasAnyToken(signals, ["luxury", "ancient", "thermal", "resort"])) {
    return "Luxury Bathhouse";
  }

  if (hasAnyToken(signals, ["guided", "ritual", "breathwork", "aufguss", "social", "community"])) {
    return "Social Sauna";
  }

  if (hasAnyToken(signals, ["resort", "destination", "campus", "retreat"])) {
    return "Regional Spa Resort";
  }

  if (input.venueType === "bathhouse" && bathhouseStrength >= 2) {
    return "Luxury Bathhouse";
  }

  return "Neighborhood Spa";
};

export const buildSearchFacets = (input: {
  name: string;
  categories: string[];
  features: string[];
  venueType: VenueType;
  existing?: SearchFacets;
}): SearchFacets => {
  const signals = gatherSignals(input);
  const has = (tokens: string[]): boolean => hasAnyToken(signals, tokens);

  return {
    neighborhood: input.existing?.neighborhood,
    borough: input.existing?.borough,
    has_sauna: has(["sauna", "banya", "aufguss"]),
    has_cold_plunge: has(["cold", "plunge", "ice", "contrast"]),
    has_steam_room: has(["steam", "hammam"]),
    has_hot_pool: has(["hot", "pool", "onsen"]),
    has_thermal_circuit: has(["thermal", "circuit", "bathhouse"]),
    has_guided_rituals: has(["guided", "ritual", "aufguss"]),
    has_breathwork: has(["breathwork"]),
    has_treatments: has(["treatment", "therapy", "facial"]),
    has_massages: has(["massage", "massages"]),
    has_bodywork: has(["bodywork", "manual", "therapy"]),
    has_recovery_clinic: has(["recovery", "clinic"]),
    has_iv_therapy: has(["iv"]),
    has_hyperbaric: has(["hyperbaric"]),
    has_red_light: has(["red", "light"]),
    has_cryotherapy: has(["cryotherapy", "cryo"]),
  };
};

export const buildSearchTags = (input: {
  name: string;
  categories: string[];
  features: string[];
  primaryCategory: PrimaryCategory;
  venueType: VenueType;
  facets: SearchFacets;
}): string[] => {
  const tags = new Set<string>();
  const textSignals = gatherSignals({ name: input.name, categories: input.categories, features: input.features, venueType: input.venueType });

  tags.add(toKebab(input.primaryCategory));
  tags.add(toKebab(input.venueType));

  if (input.facets.has_guided_rituals) tags.add("ritual-led");
  if (input.facets.has_hyperbaric || input.facets.has_iv_therapy || input.facets.has_recovery_clinic) {
    tags.add("medical-wellness");
    tags.add("recovery-focused");
  }
  if (input.facets.has_cold_plunge) tags.add("contrast-therapy");
  if (input.facets.has_sauna) tags.add("sauna-culture");
  if (hasAnyToken(textSignals, ["social", "community", "group"])) tags.add("social");
  if (hasAnyToken(textSignals, ["traditional", "banya", "venik", "platza"])) tags.add("traditional");
  if (hasAnyToken(textSignals, ["luxury", "high", "design", "ancient"])) tags.add("luxury");
  if (hasAnyToken(textSignals, ["destination", "resort", "retreat"])) tags.add("destination");
  if (hasAnyToken(textSignals, ["urban", "city", "downtown", "manhattan", "brooklyn", "berlin"])) tags.add("urban");

  return [...tags].map(toKebab).filter(Boolean).sort();
};

export const jaccardSimilarity = (a: string, b: string): number => {
  const aSet = tokenSet(a);
  const bSet = tokenSet(b);
  const union = new Set([...aSet, ...bSet]);
  if (!union.size) return 0;

  let intersectionCount = 0;
  union.forEach((token) => {
    if (aSet.has(token) && bSet.has(token)) intersectionCount += 1;
  });

  return Number((intersectionCount / union.size).toFixed(2));
};

export const areClearDuplicates = (a: CandidateVenueRaw, b: CandidateVenueRaw): boolean => {
  const aWebsite = normalizeWebsite(a.website);
  const bWebsite = normalizeWebsite(b.website);
  if (aWebsite && bWebsite && aWebsite === bWebsite) return true;

  const sameCity = normalizeText(a.city) === normalizeText(b.city);
  const nameMatch = normalizedName(a.name) === normalizedName(b.name);
  const aAddress = normalizeAddress(a.address);
  const bAddress = normalizeAddress(b.address);
  const addressMatch = Boolean(aAddress && bAddress && aAddress === bAddress);

  return sameCity && (nameMatch || addressMatch);
};

export const getAmbiguousDuplicate = (a: CandidateVenueRaw, b: CandidateVenueRaw): AmbiguousDuplicate | null => {
  if (areClearDuplicates(a, b)) return null;
  const sameCity = normalizeText(a.city) === normalizeText(b.city);
  if (!sameCity) return null;

  const similarity = jaccardSimilarity(a.name, b.name);
  if (similarity < 0.65) return null;

  return {
    city: a.city,
    candidate_a: { name: a.name, website: a.website, address: a.address, source_urls: a.source_urls },
    candidate_b: { name: b.name, website: b.website, address: b.address, source_urls: b.source_urls },
    reason: "Name similarity in same city exceeds ambiguity threshold.",
    similarity_score: similarity,
  };
};

export const inferVenueType = (categories: string[]): VenueType => {
  const normalized = categories.map((category) => category.toLowerCase());
  if (normalized.some((category) => category.includes("contrast"))) return "contrast_therapy";
  if (normalized.some((category) => category.includes("bathhouse") || category.includes("hammam"))) return "bathhouse";
  if (normalized.some((category) => category.includes("sauna"))) return "sauna";
  if (normalized.some((category) => category.includes("spa"))) return "spa";
  return "other";
};



const CITY_COORDINATE_FALLBACKS: Record<string, { lat: number; lng: number }> = {
  "new-york": { lat: 40.7128, lng: -74.006 },
  "san-francisco": { lat: 37.7749, lng: -122.4194 },
  "los-angeles": { lat: 34.0522, lng: -118.2437 },
  miami: { lat: 25.7617, lng: -80.1918 },
  chicago: { lat: 41.8781, lng: -87.6298 },
};

const citySlug = (value: string): string => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const withCoordinateFallback = (candidate: CandidateVenueRaw, existing?: CanonicalVenue): { lat: number; lng: number } => {
  const existingCoordinates = existing?.coordinates;
  if (existingCoordinates && existingCoordinates.lat !== 0 && existingCoordinates.lng !== 0) {
    return existingCoordinates;
  }
  if (typeof candidate.lat === "number" && typeof candidate.lng === "number") {
    return { lat: candidate.lat, lng: candidate.lng };
  }

  return CITY_COORDINATE_FALLBACKS[citySlug(candidate.city)] ?? { lat: 0, lng: 0 };
};

const inferDiscoveredFrom = (candidate: CandidateVenueRaw, existing?: CanonicalVenue): string => {
  if (existing?.provenance?.discovered_from && existing.provenance.discovered_from !== "unknown") return existing.provenance.discovered_from;

  const labels = (candidate.source_provenance ?? []).map((entry) => `${entry.source_label} ${entry.source_url}`.toLowerCase()).join(" ");
  if (labels.includes("openstreetmap") || labels.includes("overpass")) return "osm";
  if (labels.includes("directory")) return "directory_seed";
  if (labels.includes("manual")) return "manual";
  if (labels.includes("google")) return "google_places";

  const sourceType = candidate.source_provenance?.[0]?.source_type;
  if (sourceType === "manual") return "manual";
  if (sourceType === "directory_seed") return "directory_seed";
  if (sourceType === "aggregator") return "aggregator";

  return "unknown";
};

const buildEnrichedFrom = (candidate: CandidateVenueRaw, existing?: CanonicalVenue): string[] | undefined => {
  const enriched = new Set<string>(existing?.provenance?.enriched_from ?? []);

  for (const source of candidate.enrichment_sources ?? []) {
    if (source.trim()) enriched.add(source.trim());
  }

  const labels = (candidate.source_provenance ?? []).map((entry) => `${entry.source_label} ${entry.source_url}`.toLowerCase());
  if (labels.some((label) => label.includes("google places"))) {
    enriched.add("google_places");
  }

  return enriched.size > 0 ? [...enriched].sort() : undefined;
};

const buildReviewSources = (candidate: CandidateVenueRaw, existing?: CanonicalVenue): string[] | undefined => {
  const reviewSources = new Set<string>(existing?.provenance?.review_sources ?? []);
  for (const source of candidate.review_sources ?? []) {
    if (source.trim()) reviewSources.add(source.trim());
  }
  return reviewSources.size > 0 ? [...reviewSources].sort() : undefined;
};

const classifyBathingStyleWithFallback = (features: string[], existing?: CanonicalVenue): BathingStyle => {
  if (existing?.bathing_style) return existing.bathing_style;
  return classifyBathingStyle({ features });
};

export const toCanonicalVenue = (candidate: CandidateVenueRaw, existing?: CanonicalVenue): CanonicalVenue => {
  const timestamp = new Date().toISOString();
  const slug = existing?.slug ?? createStableSlug(candidate.name, candidate.city);
  const categories = Array.from(new Set([...(existing?.categories ?? []), ...candidate.candidate_categories]));
  const features = existing?.features ?? [];
  const venueType = existing?.venue_type ?? inferVenueType(candidate.candidate_categories);
  const primaryCategory = existing?.primary_category ?? classifyPrimaryCategory({
    name: existing?.name ?? candidate.name,
    categories,
    features,
    venueType,
  });
  const facets = buildSearchFacets({
    name: existing?.name ?? candidate.name,
    categories,
    features,
    venueType,
    existing: {
      ...existing?.search_facets,
      neighborhood: existing?.search_facets?.neighborhood ?? candidate.neighborhood,
      borough: existing?.search_facets?.borough ?? candidate.borough,
    },
  });
  const searchTags = buildSearchTags({
    name: existing?.name ?? candidate.name,
    categories,
    features,
    primaryCategory,
    venueType,
    facets,
  });
  const discoveredFrom = inferDiscoveredFrom(candidate, existing);
  const bathingStyle = classifyBathingStyleWithFallback(features, existing);
  const enrichedFrom = buildEnrichedFrom(candidate, existing);
  const reviewSources = buildReviewSources(candidate, existing);

  const canonicalId = existing?.id && isUuid(existing.id) ? existing.id : createStableVenueId(slug);

  return {
    id: canonicalId,
    slug,
    name: existing?.name ?? candidate.name,
    city: candidate.city,
    country: candidate.country,
    coordinates: withCoordinateFallback(candidate, existing),
    website: existing?.website ?? candidate.website,
    categories,
    features,
    venue_type: venueType,
    category: primaryCategory,
    primary_category: primaryCategory,
    bathing_style: bathingStyle,
    search_facets: facets,
    search_tags: searchTags,
    provenance: {
      discovered_from: discoveredFrom,
      enriched_from: enrichedFrom,
      review_sources: reviewSources,
      last_canonicalized_at: timestamp,
    },
    source_urls: Array.from(new Set([...(existing?.source_urls ?? []), ...candidate.source_urls])),
    editorial_status: existing?.editorial_status ?? "draft",
    ranking_eligibility: {
      is_eligible: existing?.ranking_eligibility?.is_eligible ?? false,
      evaluated_at: existing?.ranking_eligibility?.evaluated_at ?? timestamp,
      reasons: existing?.ranking_eligibility?.reasons ?? ["Awaiting evidence-backed scoring pass."],
      blockers: existing?.ranking_eligibility?.blockers ?? ["No score record generated yet."],
    },
    last_verified_at: timestamp,
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
  };
};
