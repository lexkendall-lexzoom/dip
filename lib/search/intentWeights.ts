import type { SearchFacets } from "../schema/models.ts";
import type { QueryIntent } from "./resolveQuery.ts";

export type IntentWeights = {
  signal_weights: Record<string, number>;
  facet_boosts: Partial<Record<keyof SearchFacets, number>>;
  tag_boosts: Record<string, number>;
  category_boosts: Record<string, number>;
  max_total_boost: number;
};

const hasAny = (list: string[], values: string[]): boolean => values.some((value) => list.includes(value));

export const deriveIntentWeights = (intent: QueryIntent): IntentWeights => {
  const weights: IntentWeights = {
    signal_weights: {},
    facet_boosts: {},
    tag_boosts: {},
    category_boosts: {},
    max_total_boost: 0.8,
  };

  if (intent.required_facets.has_cold_plunge) {
    weights.signal_weights.cold_plunge_quality = 0.22;
    weights.signal_weights.cold_plunge_access = 0.16;
    weights.facet_boosts.has_cold_plunge = 0.12;
  }

  if (intent.required_facets.has_sauna) {
    weights.signal_weights.sauna_quality = 0.2;
    weights.signal_weights.ritual_quality = 0.12;
    weights.facet_boosts.has_sauna = 0.12;
  }

  if (intent.required_facets.has_hyperbaric) {
    weights.signal_weights.facility_condition = 0.1;
    weights.facet_boosts.has_hyperbaric = 0.16;
  }

  if (intent.required_facets.has_thermal_circuit) {
    weights.signal_weights.thermal_circuit_quality = 0.2;
    weights.facet_boosts.has_thermal_circuit = 0.12;
  }

  if (intent.preferred_category === "Social Sauna") {
    weights.category_boosts["Social Sauna"] = 0.18;
    weights.signal_weights.ritual_quality = Math.max(weights.signal_weights.ritual_quality ?? 0, 0.15);
    weights.signal_weights.staff_friendliness = Math.max(weights.signal_weights.staff_friendliness ?? 0, 0.08);
    weights.signal_weights.design_ambience = Math.max(weights.signal_weights.design_ambience ?? 0, 0.08);
  }

  if (intent.preferred_category === "Social Wellness Club") {
    weights.category_boosts["Social Wellness Club"] = 0.18;
  }

  if (hasAny(intent.preferred_tags, ["luxury", "high-design"])) {
    weights.signal_weights.thermal_circuit_quality = Math.max(weights.signal_weights.thermal_circuit_quality ?? 0, 0.14);
    weights.signal_weights.design_ambience = Math.max(weights.signal_weights.design_ambience ?? 0, 0.14);
    weights.signal_weights.facility_condition = Math.max(weights.signal_weights.facility_condition ?? 0, 0.1);
    weights.tag_boosts.luxury = 0.1;
    weights.tag_boosts["high-design"] = 0.08;
  }

  if (intent.preferred_tags.includes("social")) {
    weights.tag_boosts.social = 0.08;
    weights.signal_weights.staff_friendliness = Math.max(weights.signal_weights.staff_friendliness ?? 0, 0.08);
  }

  return weights;
};

export const hasMeaningfulIntent = (intent: QueryIntent): boolean => (
  Object.keys(intent.required_facets).length > 0
  || Boolean(intent.preferred_category)
  || intent.preferred_tags.length > 0
);
