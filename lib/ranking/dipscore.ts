import type { CanonicalVenue, EvidenceRecord, ScoreCategory, ScoreExplanation, ScoreRecord } from "../schema/models.ts";

export const DIPSCORE_VERSION = "v1.2";

/**
 * Scoring philosophy:
 * Facilities and Aesthetic Design carry the most weight because DipDays is ranking
 * real-world bathing destinations, not just programming concepts. Ritual Quality
 * remains a major factor, but a venue should not outrank stronger physical
 * environments purely because it has better ceremony language or guided sessions.
 */
export const DIPSCORE_WEIGHTS: Record<ScoreCategory, number> = {
  facilities: 0.3,
  aesthetic_design: 0.25,
  ritual_quality: 0.2,
  social_energy: 0.15,
  recovery_wellness: 0.1,
};

const clampScore = (value: number): number => Math.max(0, Math.min(10, Number(value.toFixed(2))));
const clampUnit = (value: number): number => Math.max(0, Math.min(1, Number(value.toFixed(2))));

const CATEGORY_TO_CLAIM: Record<ScoreCategory, EvidenceRecord["claim_type"]> = {
  ritual_quality: "ritual",
  aesthetic_design: "aesthetic",
  social_energy: "social",
  facilities: "facilities",
  recovery_wellness: "recovery",
};

const allScoreCategories = (): ScoreCategory[] => ["ritual_quality", "aesthetic_design", "social_energy", "facilities", "recovery_wellness"];

const evidenceForCategory = (evidence: EvidenceRecord[], category: ScoreCategory): EvidenceRecord[] =>
  evidence.filter((item) => item.claim_type === CATEGORY_TO_CLAIM[category]);

const confidenceAverage = (records: EvidenceRecord[]): number => {
  if (!records.length) return 0;
  return clampUnit(records.reduce((acc, item) => acc + item.confidence, 0) / records.length);
};

const recordToScore = (record: EvidenceRecord): number => {
  if (typeof record.claim_value === "number") {
    return clampScore(record.claim_value <= 1 ? record.claim_value * 10 : record.claim_value);
  }

  if (typeof record.claim_value === "boolean") {
    return record.claim_value ? 8 : 0;
  }

  const asNumber = Number(record.claim_value);
  if (!Number.isNaN(asNumber)) return clampScore(asNumber <= 1 ? asNumber * 10 : asNumber);
  return 0;
};

const weightedCategoryScore = (records: EvidenceRecord[]): number => {
  if (!records.length) return 0;
  const totalWeight = records.reduce((sum, record) => sum + record.confidence, 0);
  if (totalWeight <= 0) return 0;

  const weightedScore = records.reduce((sum, record) => sum + (recordToScore(record) * record.confidence), 0) / totalWeight;
  const verifiedBoost = records.some((record) => record.human_verified) ? 0.2 : 0;
  return clampScore(weightedScore + verifiedBoost);
};

const buildEvidenceCounts = (evidence: EvidenceRecord[]): ScoreExplanation["evidence_counts"] => ({
  ritual: evidence.filter((item) => item.claim_type === "ritual").length,
  aesthetic: evidence.filter((item) => item.claim_type === "aesthetic").length,
  social: evidence.filter((item) => item.claim_type === "social").length,
  facilities: evidence.filter((item) => item.claim_type === "facilities").length,
  recovery: evidence.filter((item) => item.claim_type === "recovery").length,
  factual: evidence.filter((item) => item.claim_type === "factual").length,
});

const categoryCoverage = (records: EvidenceRecord[]): number => {
  if (records.length === 0) return 0;
  return clampUnit(Math.min(1, records.length / 4));
};

const diagnosticsForCategory = (evidence: EvidenceRecord[]) => {
  const diagnostics = {} as ScoreExplanation["category_diagnostics"];

  allScoreCategories().forEach((category) => {
    const records = evidenceForCategory(evidence, category);
    diagnostics[category] = {
      evidence_count: records.length,
      confidence: confidenceAverage(records),
      coverage: categoryCoverage(records),
    };
  });

  return diagnostics;
};

export function calculateRitualScore(venue: CanonicalVenue, evidence: EvidenceRecord[]): number {
  const base = weightedCategoryScore(evidenceForCategory(evidence, "ritual_quality"));
  const editorialLift = venue.editorial_status === "published" ? 0.15 : 0;
  return clampScore(base + editorialLift);
}

export function calculateAestheticScore(_venue: CanonicalVenue, evidence: EvidenceRecord[]): number {
  return weightedCategoryScore(evidenceForCategory(evidence, "aesthetic_design"));
}

export function calculateSocialScore(_venue: CanonicalVenue, evidence: EvidenceRecord[]): number {
  return weightedCategoryScore(evidenceForCategory(evidence, "social_energy"));
}

export function calculateFacilitiesScore(_venue: CanonicalVenue, evidence: EvidenceRecord[]): number {
  const records = evidenceForCategory(evidence, "facilities");
  const base = weightedCategoryScore(records);
  const completenessBonus = records.length >= 2 ? 0.2 : 0;
  return clampScore(base + completenessBonus);
}

export function calculateRecoveryScore(_venue: CanonicalVenue, evidence: EvidenceRecord[]): number {
  return weightedCategoryScore(evidenceForCategory(evidence, "recovery_wellness"));
}

export function calculateCoverageScore(_venue: CanonicalVenue, evidence: EvidenceRecord[]): number {
  const diagnostics = diagnosticsForCategory(evidence);
  const breadth = allScoreCategories().map((category) => (diagnostics[category].evidence_count > 0 ? 1 : 0));
  const avgCoverage = allScoreCategories().reduce((sum, category) => sum + diagnostics[category].coverage, 0) / allScoreCategories().length;
  return clampUnit((breadth.reduce((a, b) => a + b, 0) / breadth.length) * 0.65 + avgCoverage * 0.35);
}

export function calculateConfidenceScore(_venue: CanonicalVenue, evidence: EvidenceRecord[]): number {
  if (!evidence.length) return 0;

  const meanConfidence = evidence.reduce((sum, record) => sum + record.confidence, 0) / evidence.length;
  const verifiedRatio = evidence.reduce((sum, record) => sum + (record.human_verified ? 1 : 0), 0) / evidence.length;
  return clampUnit(meanConfidence * 0.8 + verifiedRatio * 0.2);
}

const computeRankingEligibility = (
  venue: CanonicalVenue,
  diagnostics: ScoreExplanation["category_diagnostics"],
  coverageScore: number,
  confidenceScore: number
): { ranking_eligible: boolean; blockers: string[]; caveats: string[] } => {
  const blockers: string[] = [];
  const caveats: string[] = [];

  if (!venue.id || !venue.slug || !venue.name || !venue.city || !venue.country) blockers.push("Missing required identity fields.");
  if (diagnostics.facilities.evidence_count < 1) blockers.push("Facilities evidence is required for ranking.");
  if (coverageScore < 0.45) blockers.push("Coverage is below rankable threshold (0.45).");
  if (confidenceScore < 0.4) blockers.push("Confidence is below rankable threshold (0.40).");

  if (diagnostics.ritual_quality.evidence_count < 1) caveats.push("Ritual evidence is sparse.");
  if (diagnostics.social_energy.evidence_count < 1) caveats.push("Social evidence is sparse.");
  if (diagnostics.recovery_wellness.evidence_count < 1) caveats.push("Recovery evidence is sparse.");

  return { ranking_eligible: blockers.length === 0, blockers, caveats };
};

export function calculateDipScore(venue: CanonicalVenue, evidence: EvidenceRecord[]): ScoreRecord {
  const ritual_quality = calculateRitualScore(venue, evidence);
  const aesthetic_design = calculateAestheticScore(venue, evidence);
  const social_energy = calculateSocialScore(venue, evidence);
  const facilities = calculateFacilitiesScore(venue, evidence);
  const recovery_wellness = calculateRecoveryScore(venue, evidence);

  const weightedOverall =
    facilities * DIPSCORE_WEIGHTS.facilities +
    aesthetic_design * DIPSCORE_WEIGHTS.aesthetic_design +
    ritual_quality * DIPSCORE_WEIGHTS.ritual_quality +
    social_energy * DIPSCORE_WEIGHTS.social_energy +
    recovery_wellness * DIPSCORE_WEIGHTS.recovery_wellness;

  const coverage_score = calculateCoverageScore(venue, evidence);
  const confidence_score = calculateConfidenceScore(venue, evidence);
  const diagnostics = diagnosticsForCategory(evidence);

  const { ranking_eligible, blockers, caveats } = computeRankingEligibility(
    venue,
    diagnostics,
    coverage_score,
    confidence_score
  );

  const evidenceCounts = buildEvidenceCounts(evidence);
  const coveragePenalty = coverage_score < 0.6 ? 0.85 + coverage_score * 0.15 : 1;
  const confidencePenalty = confidence_score < 0.6 ? 0.85 + confidence_score * 0.15 : 1;
  const overall = clampScore(weightedOverall * coveragePenalty * confidencePenalty);

  const top_contributors: ScoreExplanation["top_contributors"] = [
    { category: "facilities", score: facilities, reason: `${diagnostics.facilities.evidence_count} facilities signals.` },
    { category: "aesthetic_design", score: aesthetic_design, reason: `${diagnostics.aesthetic_design.evidence_count} aesthetic signals.` },
    { category: "ritual_quality", score: ritual_quality, reason: `${diagnostics.ritual_quality.evidence_count} ritual signals.` },
    { category: "social_energy", score: social_energy, reason: `${diagnostics.social_energy.evidence_count} social signals.` },
    { category: "recovery_wellness", score: recovery_wellness, reason: `${diagnostics.recovery_wellness.evidence_count} recovery signals.` },
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const explanation: ScoreExplanation = {
    top_contributors,
    missing_data_warnings: allScoreCategories()
      .filter((category) => diagnostics[category].evidence_count === 0)
      .map((category) => `Missing evidence for ${category}.`),
    eligibility_blockers: blockers,
    eligibility_caveats: caveats,
    evidence_counts: evidenceCounts,
    category_diagnostics: diagnostics,
  };

  return {
    venue_id: venue.id,
    score_version: DIPSCORE_VERSION,
    ritual_quality,
    aesthetic_design,
    social_energy,
    facilities,
    recovery_wellness,
    overall,
    coverage_score,
    confidence_score,
    ranking_eligible,
    explanation,
    scoring_metadata: {
      review_count: evidence.filter((record) => record.source_type === "review").length,
    },
    computed_at: new Date().toISOString(),
  };
}
