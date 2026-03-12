import {
  CLAIM_TYPES,
  EDITORIAL_STATUSES,
  PRIMARY_CATEGORIES,
  SOURCE_TYPES,
  VENUE_TYPES,
} from "./models.ts";
import { isUuid } from "./identity.ts";
import type {
  CanonicalVenue,
  EvidenceRecord,
  ScoreCategory,
  ScoreExplanation,
  ScoreRecord,
  SearchFacets,
} from "./models.ts";

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isIsoDate = (value: unknown): value is string => isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
const inRange = (value: number, min: number, max: number): boolean => value >= min && value <= max;

const validateStringArray = (value: unknown, field: string): string[] => {
  const errors: string[] = [];
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return errors;
  }
  if ((value as unknown[]).some((item) => !isNonEmptyString(item))) {
    errors.push(`${field} must contain only non-empty strings`);
  }
  return errors;
};

const SCORE_FIELDS: ScoreCategory[] = ["ritual_quality", "aesthetic_design", "social_energy", "facilities", "recovery_wellness"];
const FACET_BOOLEAN_FIELDS: Array<keyof Omit<SearchFacets, "neighborhood" | "borough">> = [
  "has_sauna",
  "has_cold_plunge",
  "has_steam_room",
  "has_hot_pool",
  "has_thermal_circuit",
  "has_guided_rituals",
  "has_breathwork",
  "has_treatments",
  "has_massages",
  "has_bodywork",
  "has_recovery_clinic",
  "has_iv_therapy",
  "has_hyperbaric",
  "has_red_light",
  "has_cryotherapy",
];

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

const validateExplanation = (explanation: ScoreExplanation | undefined): string[] => {
  const errors: string[] = [];
  if (!explanation) {
    errors.push("explanation is required");
    return errors;
  }

  if (!Array.isArray(explanation.top_contributors)) errors.push("top_contributors must be an array");
  if (!Array.isArray(explanation.missing_data_warnings)) errors.push("missing_data_warnings must be an array");
  if (!Array.isArray(explanation.eligibility_blockers)) errors.push("eligibility_blockers must be an array");
  if (!Array.isArray(explanation.eligibility_caveats)) errors.push("eligibility_caveats must be an array");

  if (!explanation.evidence_counts) errors.push("evidence_counts is required");

  if (!explanation.category_diagnostics) {
    errors.push("category_diagnostics is required");
  } else {
    SCORE_FIELDS.forEach((field) => {
      const diagnostic = explanation.category_diagnostics[field];
      if (!diagnostic) {
        errors.push(`category_diagnostics.${field} missing`);
        return;
      }
      if (!isFiniteNumber(diagnostic.evidence_count) || diagnostic.evidence_count < 0) {
        errors.push(`category_diagnostics.${field}.evidence_count must be >= 0`);
      }
      if (!isFiniteNumber(diagnostic.confidence) || !inRange(diagnostic.confidence, 0, 1)) {
        errors.push(`category_diagnostics.${field}.confidence must be in [0,1]`);
      }
      if (!isFiniteNumber(diagnostic.coverage) || !inRange(diagnostic.coverage, 0, 1)) {
        errors.push(`category_diagnostics.${field}.coverage must be in [0,1]`);
      }
    });
  }

  return errors;
};

const validateProvenance = (provenance: CanonicalVenue["provenance"] | undefined): string[] => {
  const errors: string[] = [];
  if (!provenance) {
    errors.push("provenance is required");
    return errors;
  }

  if (!isNonEmptyString(provenance.discovered_from)) {
    errors.push("provenance.discovered_from is required");
  }
  if (provenance.enriched_from !== undefined) {
    errors.push(...validateStringArray(provenance.enriched_from, "provenance.enriched_from"));
  }
  if (provenance.review_sources !== undefined) {
    errors.push(...validateStringArray(provenance.review_sources, "provenance.review_sources"));
  }
  if (!isIsoDate(provenance.last_canonicalized_at)) {
    errors.push("provenance.last_canonicalized_at must be ISO date string");
  }

  return errors;
};

const validateSearchFacets = (facets: CanonicalVenue["search_facets"] | undefined): string[] => {
  const errors: string[] = [];
  if (!facets) {
    errors.push("search_facets is required");
    return errors;
  }

  if (facets.neighborhood !== undefined && !isNonEmptyString(facets.neighborhood)) {
    errors.push("search_facets.neighborhood must be a non-empty string when provided");
  }
  if (facets.borough !== undefined && !isNonEmptyString(facets.borough)) {
    errors.push("search_facets.borough must be a non-empty string when provided");
  }

  for (const key of FACET_BOOLEAN_FIELDS) {
    if (typeof facets[key] !== "boolean") {
      errors.push(`search_facets.${key} must be boolean`);
    }
  }

  return errors;
};

export function validateCanonicalVenue(venue: Partial<CanonicalVenue>): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(venue.id)) {
    errors.push("id is required");
  } else if (!isUuid(venue.id)) {
    errors.push("id must be a valid UUID");
  }
  if (!isNonEmptyString(venue.slug)) errors.push("slug is required");
  if (!isNonEmptyString(venue.name)) errors.push("name is required");
  if (!isNonEmptyString(venue.city)) errors.push("city is required");
  if (!isNonEmptyString(venue.country)) errors.push("country is required");

  if (!venue.coordinates || !isFiniteNumber(venue.coordinates.lat) || !isFiniteNumber(venue.coordinates.lng)) {
    errors.push("coordinates.lat/lng are required numbers");
  } else {
    if (!inRange(venue.coordinates.lat, -90, 90)) errors.push("coordinates.lat must be in [-90,90]");
    if (!inRange(venue.coordinates.lng, -180, 180)) errors.push("coordinates.lng must be in [-180,180]");
  }

  if (!Array.isArray(venue.categories)) errors.push("categories must be an array");
  if (!Array.isArray(venue.features)) errors.push("features must be an array");
  if (!Array.isArray(venue.source_urls)) errors.push("source_urls must be an array");
  if (!Array.isArray(venue.search_tags)) {
    errors.push("search_tags must be an array");
  } else if (venue.search_tags.some((tag) => !isNonEmptyString(tag))) {
    errors.push("search_tags must not contain empty values");
  }

  if (!venue.venue_type || !VENUE_TYPES.includes(venue.venue_type)) errors.push("venue_type is invalid");
  if (!venue.primary_category || !PRIMARY_CATEGORIES.includes(venue.primary_category)) errors.push("primary_category is invalid");
  if (!venue.editorial_status || !EDITORIAL_STATUSES.includes(venue.editorial_status)) errors.push("editorial_status is invalid");

  errors.push(...validateSearchFacets(venue.search_facets));
  errors.push(...validateProvenance(venue.provenance));

  if (!venue.ranking_eligibility) {
    errors.push("ranking_eligibility is required");
  } else {
    if (typeof venue.ranking_eligibility.is_eligible !== "boolean") errors.push("ranking_eligibility.is_eligible is required");
    if (!isIsoDate(venue.ranking_eligibility.evaluated_at)) errors.push("ranking_eligibility.evaluated_at must be ISO date string");
    if (!Array.isArray(venue.ranking_eligibility.reasons)) errors.push("ranking_eligibility.reasons must be an array");
    if (!Array.isArray(venue.ranking_eligibility.blockers)) errors.push("ranking_eligibility.blockers must be an array");
  }

  if (venue.website !== undefined && !isNonEmptyString(venue.website)) errors.push("website must be a non-empty string when provided");
  if (venue.last_verified_at !== undefined && !isIsoDate(venue.last_verified_at)) errors.push("last_verified_at must be ISO date string when provided");
  if (!isIsoDate(venue.created_at)) errors.push("created_at must be ISO date string");
  if (!isIsoDate(venue.updated_at)) errors.push("updated_at must be ISO date string");

  return { valid: errors.length === 0, errors };
}

export function validateEvidenceRecord(record: Partial<EvidenceRecord>): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(record.id)) {
    errors.push("id is required");
  } else if (!isUuid(record.id)) {
    errors.push("id must be a valid UUID");
  }
  if (!isNonEmptyString(record.venue_id)) {
    errors.push("venue_id is required");
  } else if (!isUuid(record.venue_id)) {
    errors.push("venue_id must be a valid UUID");
  }
  if (!record.source_type || !SOURCE_TYPES.includes(record.source_type)) errors.push("source_type is invalid");
  if (!isNonEmptyString(record.source_label)) errors.push("source_label is required");
  if (!isIsoDate(record.extracted_at)) errors.push("extracted_at must be ISO date string");
  if (!record.claim_type || !CLAIM_TYPES.includes(record.claim_type)) errors.push("claim_type is invalid");
  if (!isNonEmptyString(record.claim_key)) errors.push("claim_key is required");
  if (record.claim_value === undefined) errors.push("claim_value is required");
  if (!isFiniteNumber(record.confidence) || !inRange(record.confidence, 0, 1)) errors.push("confidence must be in [0,1]");

  if (record.source_url !== undefined && !isNonEmptyString(record.source_url)) errors.push("source_url must be a non-empty string when provided");
  if (record.claim_unit !== undefined && !isNonEmptyString(record.claim_unit)) errors.push("claim_unit must be a non-empty string when provided");
  if (record.excerpt !== undefined && !isNonEmptyString(record.excerpt)) errors.push("excerpt must be a non-empty string when provided");
  if (record.agent_name !== undefined && !isNonEmptyString(record.agent_name)) errors.push("agent_name must be a non-empty string when provided");
  if (record.provenance_note !== undefined && !isNonEmptyString(record.provenance_note)) errors.push("provenance_note must be a non-empty string when provided");
  if (typeof record.human_verified !== "boolean") errors.push("human_verified must be boolean");

  return { valid: errors.length === 0, errors };
}

export function validateScoreRecord(score: Partial<ScoreRecord>): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(score.venue_id)) {
    errors.push("venue_id is required");
  } else if (!isUuid(score.venue_id)) {
    errors.push("venue_id must be a valid UUID");
  }
  if (!isNonEmptyString(score.score_version)) errors.push("score_version is required");

  SCORE_FIELDS.forEach((field) => {
    const value = score[field];
    if (!isFiniteNumber(value)) {
      errors.push(`${field} must be a finite number`);
      return;
    }
    if (!inRange(value, 0, 10)) errors.push(`${field} must be in [0,10]`);
  });

  if (!isFiniteNumber(score.overall) || !inRange(score.overall, 0, 10)) errors.push("overall must be in [0,10]");
  if (!isFiniteNumber(score.coverage_score) || !inRange(score.coverage_score, 0, 1)) errors.push("coverage_score must be in [0,1]");
  if (!isFiniteNumber(score.confidence_score) || !inRange(score.confidence_score, 0, 1)) errors.push("confidence_score must be in [0,1]");
  if (typeof score.ranking_eligible !== "boolean") errors.push("ranking_eligible must be boolean");
  if (!isIsoDate(score.computed_at)) errors.push("computed_at must be ISO date string");

  errors.push(...validateExplanation(score.explanation));

  return { valid: errors.length === 0, errors };
}

export function validateYamlPublishability(venue: CanonicalVenue, score: ScoreRecord): ValidationResult {
  const errors: string[] = [];

  const venueValidation = validateCanonicalVenue(venue);
  if (!venueValidation.valid) errors.push(...venueValidation.errors.map((error) => `venue.${error}`));

  const scoreValidation = validateScoreRecord(score);
  if (!scoreValidation.valid) errors.push(...scoreValidation.errors.map((error) => `score.${error}`));

  if (venue.id !== score.venue_id) errors.push("venue.id must match score.venue_id");
  if (venue.editorial_status === "draft") errors.push("editorial_status must not be draft for publishable output");
  if (!score.ranking_eligible && score.confidence_score < 0.55) errors.push("score must be ranking_eligible or confidence_score >= 0.55");
  if (score.coverage_score < 0.5) errors.push("coverage_score must be >= 0.5");

  return { valid: errors.length === 0, errors };
}
