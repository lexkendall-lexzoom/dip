import type { PrimaryCategory, SearchFacets } from "../schema/models.ts";

export type QueryIntent = {
  location: {
    city?: string;
    borough?: string;
    neighborhood?: string;
  };
  required_facets: Partial<Record<keyof SearchFacets, boolean>>;
  preferred_category?: PrimaryCategory;
  preferred_tags: string[];
  sort: "best" | "nearest";
};

const CITY_ALIASES: Record<string, string> = {
  nyc: "new-york",
  "new york": "new-york",
  "new york city": "new-york",
  manhattan: "new-york",
  brooklyn: "new-york",
  queens: "new-york",
  "san francisco": "san-francisco",
  sf: "san-francisco",
  "los angeles": "los-angeles",
  la: "los-angeles",
  miami: "miami",
  chicago: "chicago",
  berlin: "berlin",
};

const BOROUGHS = ["manhattan", "brooklyn", "queens", "bronx", "staten island"];

const BOROUGH_ALIASES: Record<string, string> = {
  manhattan: "manhattan",
  brooklyn: "brooklyn",
  bk: "brooklyn",
  queens: "queens",
  qns: "queens",
  bronx: "bronx",
  "the bronx": "bronx",
  "staten island": "staten island",
  "staten-island": "staten island",
  si: "staten island",
};

const NYC_BOROUGH_SET = new Set(BOROUGHS);

const FACET_KEYWORDS: Array<{ keywords: string[]; facet: keyof SearchFacets }> = [
  { keywords: ["sauna", "banya"], facet: "has_sauna" },
  { keywords: ["cold plunge", "ice bath", "plunge"], facet: "has_cold_plunge" },
  { keywords: ["steam", "steam room", "hammam"], facet: "has_steam_room" },
  { keywords: ["hot pool", "thermal pool", "onsen"], facet: "has_hot_pool" },
  { keywords: ["thermal circuit", "circuit"], facet: "has_thermal_circuit" },
  { keywords: ["guided ritual", "ritual", "aufguss"], facet: "has_guided_rituals" },
  { keywords: ["breathwork"], facet: "has_breathwork" },
  { keywords: ["treatment", "treatments"], facet: "has_treatments" },
  { keywords: ["massage", "massages"], facet: "has_massages" },
  { keywords: ["bodywork"], facet: "has_bodywork" },
  { keywords: ["recovery clinic", "recovery"], facet: "has_recovery_clinic" },
  { keywords: ["iv", "iv therapy"], facet: "has_iv_therapy" },
  { keywords: ["hyperbaric"], facet: "has_hyperbaric" },
  { keywords: ["red light"], facet: "has_red_light" },
  { keywords: ["cryotherapy", "cryo"], facet: "has_cryotherapy" },
];

const CATEGORY_KEYWORDS: Array<{ keywords: string[]; category: PrimaryCategory }> = [
  { keywords: ["social sauna"], category: "Social Sauna" },
  { keywords: ["traditional banya", "banya"], category: "Traditional Banya" },
  { keywords: ["luxury bathhouse", "bathhouse"], category: "Luxury Bathhouse" },
  { keywords: ["wellness club", "social wellness club"], category: "Social Wellness Club" },
  { keywords: ["neighborhood spa"], category: "Neighborhood Spa" },
  { keywords: ["resort", "regional spa resort", "destination spa"], category: "Regional Spa Resort" },
];

const TAG_KEYWORDS = ["luxury", "social", "traditional", "quiet", "ritual-led", "recovery-focused", "medical-wellness", "destination", "urban", "high-design"];

const norm = (value: string): string => value.toLowerCase().trim().replace(/[^a-z0-9\s-]+/g, " ").replace(/\s+/g, " ");

const includesAny = (value: string, keywords: string[]): boolean => keywords.some((keyword) => value.includes(keyword));

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const containsTerm = (haystack: string, needle: string): boolean => {
  const pattern = `(^|\\s)${escapeRegExp(needle)}(?=\\s|$)`;
  return new RegExp(pattern).test(haystack);
};

const parseLocation = (normalized: string): QueryIntent["location"] => {
  const location: QueryIntent["location"] = {};

  const applyBorough = (raw: string): boolean => {
    for (const [alias, borough] of Object.entries(BOROUGH_ALIASES)) {
      if (containsTerm(raw, alias)) {
        location.borough = borough;
        if (NYC_BOROUGH_SET.has(borough)) {
          location.city = "new-york";
        }
        return true;
      }
    }

    return false;
  };

const parseLocation = (normalized: string): QueryIntent["location"] => {
  const location: QueryIntent["location"] = {};

  const inMatch = normalized.match(/\bin\s+([a-z\s-]+)/);
  const locationPhrase = inMatch?.[1]?.trim();

  if (locationPhrase) {
    if (applyBorough(locationPhrase)) {
      return location;
    for (const borough of BOROUGHS) {
      if (locationPhrase.includes(borough)) {
        location.borough = borough;
        return location;
      }
    }

    const cityAlias = CITY_ALIASES[locationPhrase];
    if (cityAlias) {
      location.city = cityAlias;
      return location;
    }

    location.neighborhood = locationPhrase;
    return location;
  }

  if (applyBorough(normalized)) {
    return location;
  }

  for (const borough of BOROUGHS) {
    if (containsTerm(normalized, borough)) {
      location.borough = borough;
      location.city = "new-york";
  for (const borough of BOROUGHS) {
    if (normalized.includes(borough)) {
      location.borough = borough;
      return location;
    }
  }

  for (const [alias, city] of Object.entries(CITY_ALIASES)) {
    if (containsTerm(normalized, alias)) {
    if (normalized.includes(alias)) {
      location.city = city;
      return location;
    }
  }

  return location;
};

export const resolveQuery = (query: string): QueryIntent => {
  const normalized = norm(query);

  const required_facets: QueryIntent["required_facets"] = {};
  for (const rule of FACET_KEYWORDS) {
    if (includesAny(normalized, rule.keywords)) {
      required_facets[rule.facet] = true;
    }
  }

  const preferred_category = CATEGORY_KEYWORDS.find((rule) => includesAny(normalized, rule.keywords))?.category;
  const preferred_tags = TAG_KEYWORDS.filter((tag) => normalized.includes(tag.replace(/-/g, " ")) || normalized.includes(tag));

  return {
    location: parseLocation(normalized),
    required_facets,
    preferred_category,
    preferred_tags,
    sort: normalized.includes("nearest") || normalized.includes("near me") ? "nearest" : "best",
  };
};
