export const SOURCE_TYPES = ["official_site", "review", "editorial", "aggregator", "manual"] as const;
export type SourceType = typeof SOURCE_TYPES[number];

export const CLAIM_TYPES = ["ritual", "aesthetic", "social", "facilities", "recovery", "factual"] as const;
export type ClaimType = typeof CLAIM_TYPES[number];

export const EDITORIAL_STATUSES = ["draft", "reviewed", "published"] as const;
export type EditorialStatus = typeof EDITORIAL_STATUSES[number];

export const VENUE_TYPES = ["bathhouse", "sauna", "contrast_therapy", "spa", "wellness_studio", "other"] as const;
export type VenueType = typeof VENUE_TYPES[number];

export type RankingEligibilityState = {
  is_eligible: boolean;
  evaluated_at: string;
  reasons: string[];
  blockers: string[];
};

export interface CanonicalVenue {
  // identity
  id: string;
  slug: string;
  name: string;

  // location
  city: string;
  region?: string;
  country: string;
  coordinates: {
    lat: number;
    lng: number;
  };

  // taxonomy
  website?: string;
  categories: string[];
  features: string[];
  venue_type: VenueType;

  // provenance
  source_urls: string[];

  // state
  editorial_status: EditorialStatus;
  ranking_eligibility: RankingEligibilityState;
  last_verified_at?: string;
  created_at: string;
  updated_at: string;
}

export interface EvidenceRecord {
  id: string;
  venue_id: string;
  source_type: SourceType;
  source_url?: string;
  source_label: string;
  extracted_at: string;
  claim_type: ClaimType;
  claim_key: string;
  claim_value: string | number | boolean;
  claim_unit?: string;
  confidence: number;
  excerpt?: string;
  agent_name?: string;
  provenance_note?: string;
  human_verified: boolean;
}

export type ScoreCategory = "ritual_quality" | "aesthetic_design" | "social_energy" | "facilities" | "recovery_wellness";

export interface ScoreExplanation {
  top_contributors: Array<{
    category: ScoreCategory;
    score: number;
    reason: string;
  }>;
  missing_data_warnings: string[];
  eligibility_blockers: string[];
  eligibility_caveats: string[];
  evidence_counts: {
    ritual: number;
    aesthetic: number;
    social: number;
    facilities: number;
    recovery: number;
    factual: number;
  };
  category_diagnostics: Record<ScoreCategory, { evidence_count: number; confidence: number; coverage: number }>;
}

export interface ScoreRecord {
  venue_id: string;
  score_version: string;
  ritual_quality: number;
  aesthetic_design: number;
  social_energy: number;
  facilities: number;
  recovery_wellness: number;
  overall: number;
  coverage_score: number;
  confidence_score: number;
  ranking_eligible: boolean;
  explanation: ScoreExplanation;
  scoring_metadata?: {
    review_count?: number;
  };
  computed_at: string;
}

export interface CandidateVenueRaw {
  name: string;
  website?: string;
  address?: string;
  city: string;
  country: string;
  source_urls: string[];
  snippets: Array<{
    source_url: string;
    text: string;
  }>;
  candidate_categories: string[];
  source_provenance: Array<{
    source_type: SourceType | "directory_seed";
    source_url: string;
    source_label: string;
    discovered_at: string;
  }>;
}
