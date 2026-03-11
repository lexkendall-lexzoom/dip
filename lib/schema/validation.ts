import {
  CLAIM_TYPES,
  EDITORIAL_STATUSES,
  SOURCE_TYPES,
  VENUE_TYPES,
} from "./models.ts";
import type {
  CanonicalVenue,
  EvidenceRecord,
  ScoreCategory,
  ScoreExplanation,
  ScoreRecord,
} from "./models.ts";
  CanonicalVenue,
  EDITORIAL_STATUSES,
  EvidenceRecord,
  SOURCE_TYPES,
  ScoreCategory,
  ScoreExplanation,
  ScoreRecord,
  VENUE_TYPES,
} from "./models";

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isIsoDate = (value: unknown): value is string => isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
const inRange = (value: number, min: number, max: number): boolean => value >= min && value <= max;

const SCORE_FIELDS: ScoreCategory[] = ["ritual_quality", "aesthetic_design", "social_energy", "facilities", "recovery_wellness"];

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

  if (!explanation.evidence_counts) {
    errors.push("evidence_counts is required");
  }

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

export function validateCanonicalVenue(venue: Partial<CanonicalVenue>): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(venue.id)) errors.push("id is required");
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

  if (!venue.venue_type || !VENUE_TYPES.includes(venue.venue_type)) errors.push("venue_type is invalid");
  if (!venue.editorial_status || !EDITORIAL_STATUSES.includes(venue.editorial_status)) errors.push("editorial_status is invalid");

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

  if (!isNonEmptyString(record.id)) errors.push("id is required");
  if (!isNonEmptyString(record.venue_id)) errors.push("venue_id is required");
  if (!record.source_type || !SOURCE_TYPES.includes(record.source_type)) errors.push("source_type is invalid");
  if (!isNonEmptyString(record.source_label)) errors.push("source_label is required");
  if (!isIsoDate(record.extracted_at)) errors.push("extracted_at must be ISO date string");
  if (!record.claim_type || !CLAIM_TYPES.includes(record.claim_type)) errors.push("claim_type is invalid");
  if (!isNonEmptyString(record.claim_key)) errors.push("claim_key is required");
  if (record.claim_value === undefined) errors.push("claim_value is required");

  if (!isFiniteNumber(record.confidence) || !inRange(record.confidence, 0, 1)) {
    errors.push("confidence must be number in [0,1]");
  }

  if (record.source_url !== undefined && !isNonEmptyString(record.source_url)) errors.push("source_url must be non-empty string when provided");
  if (record.claim_unit !== undefined && !isNonEmptyString(record.claim_unit)) errors.push("claim_unit must be non-empty string when provided");
  if (record.agent_name !== undefined && !isNonEmptyString(record.agent_name)) errors.push("agent_name must be non-empty string when provided");
  if (record.provenance_note !== undefined && !isNonEmptyString(record.provenance_note)) errors.push("provenance_note must be non-empty string when provided");
  if (typeof record.human_verified !== "boolean") errors.push("human_verified must be boolean");

  return { valid: errors.length === 0, errors };
}

export function validateScoreRecord(score: Partial<ScoreRecord>): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(score.venue_id)) errors.push("venue_id is required");
  if (!isNonEmptyString(score.score_version)) errors.push("score_version is required");

  SCORE_FIELDS.forEach((field) => {
    const value = score[field];
    if (!isFiniteNumber(value) || !inRange(value, 0, 10)) {
      errors.push(`${field} must be numeric in [0,10]`);
    }
  });

  if (!isFiniteNumber(score.overall) || !inRange(score.overall, 0, 10)) errors.push("overall must be numeric in [0,10]");
  if (!isFiniteNumber(score.coverage_score) || !inRange(score.coverage_score, 0, 1)) errors.push("coverage_score must be numeric in [0,1]");
  if (!isFiniteNumber(score.confidence_score) || !inRange(score.confidence_score, 0, 1)) errors.push("confidence_score must be numeric in [0,1]");
  if (typeof score.ranking_eligible !== "boolean") errors.push("ranking_eligible must be boolean");
  if (!isIsoDate(score.computed_at)) errors.push("computed_at must be ISO date string");

  errors.push(...validateExplanation(score.explanation));

  if (score.scoring_metadata?.review_count !== undefined) {
    if (!isFiniteNumber(score.scoring_metadata.review_count) || score.scoring_metadata.review_count < 0) {
      errors.push("scoring_metadata.review_count must be >= 0");
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateYamlPublishability(venue: CanonicalVenue, score: ScoreRecord): ValidationResult {
  const errors: string[] = [];

  if (!venue.name || !venue.slug || !venue.city || !venue.country) {
    errors.push("venue missing required display fields");
  }

  if (score.coverage_score < 0.35) {
    errors.push("coverage score below publish threshold");
  }

  return { valid: errors.length === 0, errors };
}
