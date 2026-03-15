export const CORE_TYPES = [
  "sauna",
  "steam_bath",
  "hot_spring",
  "thermal_bath",
  "cold_plunge",
  "bathhouse",
  "spa_ritual",
] as const;
export type CoreType = typeof CORE_TYPES[number];

export const CULTURAL_TRADITIONS = [
  "finnish_sauna",
  "russian_banya",
  "japanese_onsen",
  "japanese_sento",
  "korean_jjimjilbang",
  "turkish_hammam",
  "roman_thermal_bath",
  "icelandic_geothermal_pool",
  "indigenous_sweat_lodge",
] as const;
export type CulturalTradition = typeof CULTURAL_TRADITIONS[number];

export const MODERN_FORMATS = [
  "urban_bathhouse",
  "luxury_bathhouse",
  "social_sauna",
  "wellness_spa",
  "hot_spring_resort",
] as const;
export type ModernFormat = typeof MODERN_FORMATS[number];

export type VenueTaxonomy = {
  core_type?: CoreType;
  cultural_tradition?: CulturalTradition;
  modern_format?: ModernFormat;
  ritual_elements?: CoreType[];
};
