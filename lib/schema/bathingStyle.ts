import type { BathingStyle } from "./models.ts";

const includesAny = (haystack: string, needles: string[]): boolean => needles.some((needle) => haystack.includes(needle));

type BathingStyleVenue = {
  features?: string[];
};

export const classifyBathingStyle = (venue: BathingStyleVenue): BathingStyle => {
  const normalized = (venue.features ?? []).map((feature) => feature.toLowerCase());
  const searchable = normalized.join(" ");

  if (includesAny(searchable, ["thermal pools", "roman baths", "hydrotherapy circuit"])) return "Roman Thermal";
  if (includesAny(searchable, ["sauna ritual", "aufguss", "cold plunge"])) return "Nordic Sauna";
  if (includesAny(searchable, ["banya", "venik", "platza"])) return "Russian Banya";
  if (includesAny(searchable, ["hammam", "steam marble rooms"])) return "Turkish Hammam";
  if (includesAny(searchable, ["jjimjilbang", "korean spa", "kiln sauna"])) return "Korean Jjimjilbang";
  if (includesAny(searchable, ["onsen", "mineral hot spring"])) return "Japanese Onsen";

  return "Modern Hybrid";
};
