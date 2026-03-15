import {
  BATHING_STYLES,
  PRIMARY_CATEGORIES,
  type BathingStyle,
  type PrimaryCategory,
} from "../lib/schema/models.ts";
import {
  CORE_TYPES,
  CULTURAL_TRADITIONS,
  MODERN_FORMATS,
  type CoreType,
  type CulturalTradition,
  type ModernFormat,
} from "../lib/schema/taxonomy.ts";

export type VenueSchema = {
  category: PrimaryCategory;
  bathing_style: BathingStyle;
  core_type?: CoreType;
  cultural_tradition?: CulturalTradition;
  modern_format?: ModernFormat;
  ritual_elements?: CoreType[];
};

export const VENUE_STATUSES = ["draft", "review", "published", "archived"] as const;
export type VenueStatus = typeof VENUE_STATUSES[number];

export const VENUE_PRIMARY_ARCHETYPES = [
  "Luxury Bathhouse",
  "Social Sauna",
  "Traditional Banya",
  "Social Wellness Club",
  "Neighborhood Spa",
  "Regional Spa Resort",
  "Other",
] as const;

export const VENUE_SOCIAL_STYLES = ["quiet", "balanced", "social", "event-driven"] as const;
export const VENUE_SETTING_TAGS = ["urban", "hotel", "destination", "waterfront", "nature", "underground"] as const;
export const VENUE_BATHHOUSE_TYPES = ["bathhouse", "sauna_club", "spa", "wellness_studio", "onsen", "hammam", "banya", "other"] as const;

export type VenueEditorialModel = {
  name: string;
  slug: string;
  status: VenueStatus;
  featured?: boolean;
  short_description: string;
  long_description?: string;
  tagline?: string;
  city: string;
  region?: string;
  country: string;
  city_metadata?: {
    city: string;
    country: string;
    lat: number;
    lng: number;
  };
  neighborhood?: string;
  address?: string;
  lat?: number;
  lng?: number;
  website_url?: string;
  booking_url?: string;
  instagram_url?: string;
  primary_archetype: string;
  secondary_archetypes?: string[];
  amenities?: string[];
  rituals?: string[];
  core_type?: CoreType;
  cultural_tradition?: CulturalTradition;
  modern_format?: ModernFormat;
  ritual_elements?: CoreType[];
  atmosphere_tags?: string[];
  social_style?: string;
  setting_tags?: string[];
  bathhouse_type?: string;
  hours?: string;
  price_tier?: string;
  reservation_required?: boolean;
  hero_image?: string;
  gallery?: string[];
  editor_notes?: string;
  source_urls?: string[];
  last_verified_at?: string;
  seo_title?: string;
  seo_description?: string;
  seo_image?: string;
  canonical_path_override?: string;
};

const toString = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : undefined;
const toStringList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const normalized = value.map((item) => toString(item)).filter((item): item is string => Boolean(item));
  return normalized.length > 0 ? normalized : undefined;
};
const toStringListFromObjects = (value: unknown, keys: string[]): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => {
      if (typeof item === "string") return toString(item);
      if (!item || typeof item !== "object") return undefined;
      for (const key of keys) {
        const candidate = (item as Record<string, unknown>)[key];
        const asString = toString(candidate);
        if (asString) return asString;
      }
      return undefined;
    })
    .filter((item): item is string => Boolean(item));
  return normalized.length > 0 ? normalized : undefined;
};
const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

export const normalizeVenueEditorialModel = (rawVenue: Record<string, unknown>): VenueEditorialModel => {
  const gallery = toStringListFromObjects(rawVenue.gallery, ["image", "src", "url"])
    ?? toStringListFromObjects(rawVenue.gallery_images, ["image", "src", "url"]);

  // Compatibility aliases keep legacy venue YAML renderable without requiring immediate migration.
  const shortDescription = toString(rawVenue.short_description)
    ?? toString(rawVenue.best_for)
    ?? toString(rawVenue.subtitle)
    ?? "";

  const normalized: VenueEditorialModel = {
    name: toString(rawVenue.name) ?? "",
    slug: toString(rawVenue.slug) ?? "",
    status: (toString(rawVenue.status) as VenueStatus | undefined) ?? "draft",
    featured: typeof rawVenue.featured === "boolean" ? rawVenue.featured : undefined,
    short_description: shortDescription,
    long_description: toString(rawVenue.long_description) ?? toString(rawVenue.review),
    tagline: toString(rawVenue.tagline) ?? toString(rawVenue.subtitle),
    city: toString(rawVenue.city) ?? "",
    region: toString(rawVenue.region),
    country: toString(rawVenue.country) ?? "",
    city_metadata: (rawVenue.city_metadata && typeof rawVenue.city_metadata === "object") ? {
      city: toString((rawVenue.city_metadata as Record<string, unknown>).city) ?? toString(rawVenue.city) ?? "",
      country: toString((rawVenue.city_metadata as Record<string, unknown>).country) ?? toString(rawVenue.country) ?? "",
      lat: toNumber((rawVenue.city_metadata as Record<string, unknown>).lat) ?? toNumber(rawVenue.lat) ?? 0,
      lng: toNumber((rawVenue.city_metadata as Record<string, unknown>).lng) ?? toNumber(rawVenue.lng) ?? 0,
    } : undefined,
    neighborhood: toString(rawVenue.neighborhood),
    address: toString(rawVenue.address),
    lat: toNumber(rawVenue.lat),
    lng: toNumber(rawVenue.lng),
    website_url: toString(rawVenue.website_url),
    booking_url: toString(rawVenue.booking_url),
    instagram_url: toString(rawVenue.instagram_url),
    primary_archetype: toString(rawVenue.primary_archetype) ?? toString(rawVenue.category) ?? "Other",
    secondary_archetypes: toStringList(rawVenue.secondary_archetypes),
    amenities: toStringList(rawVenue.amenities),
    rituals: toStringList(rawVenue.rituals),
    core_type: toString(rawVenue.core_type) as CoreType | undefined,
    cultural_tradition: toString(rawVenue.cultural_tradition) as CulturalTradition | undefined,
    modern_format: toString(rawVenue.modern_format) as ModernFormat | undefined,
    ritual_elements: toStringList(rawVenue.ritual_elements) as CoreType[] | undefined,
    atmosphere_tags: toStringList(rawVenue.atmosphere_tags),
    social_style: toString(rawVenue.social_style),
    setting_tags: toStringList(rawVenue.setting_tags),
    bathhouse_type: toString(rawVenue.bathhouse_type),
    hours: toString(rawVenue.hours),
    price_tier: toString(rawVenue.price_tier) ?? toString(rawVenue.price),
    reservation_required: typeof rawVenue.reservation_required === "boolean" ? rawVenue.reservation_required : undefined,
    hero_image: toString(rawVenue.hero_image) ?? gallery?.[0],
    gallery,
    editor_notes: toString(rawVenue.editor_notes),
    source_urls: toStringListFromObjects(rawVenue.source_urls, ["source_url", "url"]),
    last_verified_at: toString(rawVenue.last_verified_at) ?? toString(rawVenue.date_reviewed),
    seo_title: toString(rawVenue.seo_title),
    seo_description: toString(rawVenue.seo_description),
    seo_image: toString(rawVenue.seo_image),
    canonical_path_override: toString(rawVenue.canonical_path_override),
  };

  return normalized;
};

export const validateVenueEditorialModel = (rawVenue: Record<string, unknown>): { valid: boolean; errors: string[]; venue: VenueEditorialModel } => {
  const venue = normalizeVenueEditorialModel(rawVenue);
  const errors: string[] = [];

  if (!venue.name) errors.push("name is required");
  if (!venue.slug) errors.push("slug is required");
  if (!VENUE_STATUSES.includes(venue.status)) errors.push("status is invalid");
  if (!venue.city) errors.push("city is required");
  if (!venue.country) errors.push("country is required");
  if (!venue.primary_archetype) errors.push("primary_archetype is required");
  if (!venue.short_description) errors.push("short_description is required");

  return {
    valid: errors.length === 0,
    errors,
    venue,
  };
};

export const validateVenueTaxonomy = (venue: Partial<VenueSchema>): VenueSchema => {
  if (!venue.category || !PRIMARY_CATEGORIES.includes(venue.category)) {
    throw new Error(`Invalid category: ${String(venue.category)}`);
  }
  if (!venue.bathing_style || !BATHING_STYLES.includes(venue.bathing_style)) {
    throw new Error(`Invalid bathing_style: ${String(venue.bathing_style)}`);
  }

  if (venue.core_type !== undefined && !CORE_TYPES.includes(venue.core_type)) {
    throw new Error(`Invalid core_type: ${String(venue.core_type)}`);
  }
  if (venue.cultural_tradition !== undefined && !CULTURAL_TRADITIONS.includes(venue.cultural_tradition)) {
    throw new Error(`Invalid cultural_tradition: ${String(venue.cultural_tradition)}`);
  }
  if (venue.modern_format !== undefined && !MODERN_FORMATS.includes(venue.modern_format)) {
    throw new Error(`Invalid modern_format: ${String(venue.modern_format)}`);
  }
  if (venue.ritual_elements !== undefined && venue.ritual_elements.some((item) => !CORE_TYPES.includes(item))) {
    throw new Error(`Invalid ritual_elements: ${String(venue.ritual_elements.join(","))}`);
  }

  return {
    category: venue.category,
    bathing_style: venue.bathing_style,
    core_type: venue.core_type,
    cultural_tradition: venue.cultural_tradition,
    modern_format: venue.modern_format,
    ritual_elements: venue.ritual_elements,
  };
};
