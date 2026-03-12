import fs from "fs";
import path from "path";
import type { CanonicalVenue, EvidenceRecord, VenueType } from "../../lib/schema/models.ts";
import { validateCanonicalVenue, validateEvidenceRecord } from "../../lib/schema/validation.ts";

type RawVenue = {
  name: string;
  slug: string;
  city: string;
  region?: string;
  country: string;
  description?: string;
  amenities?: string[];
  tags?: string[];
  offerings?: string[];
  website?: string;
  coordinates?: {
    lat?: number;
    lng?: number;
  };
  source_urls?: string[];
};

const keywordFeatures: Record<string, string> = {
  sauna: "sauna",
  banya: "sauna",
  steam: "steam_room",
  plunge: "cold_plunge",
  thermal: "thermal_pool",
  massage: "massage",
  breathwork: "breathwork",
  class: "classes",
  aufguss: "aufguss",
  ritual: "ritual_programming",
  guided: "guided_sessions",
  hammam: "hammam",
  contrast: "contrast_therapy",
};

const detectVenueType = (features: Set<string>): VenueType => {
  if (features.has("contrast_therapy")) return "contrast_therapy";
  if (features.has("sauna") && features.has("thermal_pool")) return "bathhouse";
  if (features.has("sauna")) return "sauna";
  if (features.has("massage")) return "spa";
  return "wellness_studio";
};

const nowIso = () => new Date().toISOString();

const inferCategories = (features: Set<string>): string[] => {
  const categories: string[] = [];
  if (features.has("sauna") && (features.has("community_events") || features.has("group_ritual"))) categories.push("Social Sauna");
  if (features.has("cold_plunge") && features.has("sauna")) categories.push("Contrast Therapy");
  if (features.has("aufguss") || features.has("ritual_programming") || features.has("hammam")) categories.push("Ritual Bathhouse");
  if (features.has("massage") || features.has("breathwork") || features.has("classes")) categories.push("Recovery Studio");
  return categories;
};

const makeEvidence = (
  venueId: string,
  sourceLabel: string,
  sourceUrl: string | undefined,
  claims: Array<Pick<EvidenceRecord, "claim_type" | "claim_key" | "claim_value" | "confidence" | "excerpt">>
): EvidenceRecord[] => {
  const extractedAt = nowIso();
  return claims.map((claim, index) => ({
    id: `${venueId}-ev-${index + 1}`,
    venue_id: venueId,
    source_type: sourceUrl ? "official_site" : "aggregator",
    source_url: sourceUrl,
    source_label: sourceLabel,
    extracted_at: extractedAt,
    claim_type: claim.claim_type,
    claim_key: claim.claim_key,
    claim_value: claim.claim_value,
    confidence: claim.confidence,
    excerpt: claim.excerpt,
    agent_name: "classification-agent-v1",
    human_verified: false,
  }));
};

export function classifyVenue(rawVenue: RawVenue): { canonicalVenue: CanonicalVenue; evidence: EvidenceRecord[] } {
  const searchable = [
    rawVenue.name,
    rawVenue.description ?? "",
    ...(rawVenue.amenities ?? []),
    ...(rawVenue.tags ?? []),
    ...(rawVenue.offerings ?? []),
  ].join(" ").toLowerCase();

  const features = new Set<string>();
  Object.entries(keywordFeatures).forEach(([keyword, feature]) => {
    if (searchable.includes(keyword)) features.add(feature);
  });

  if (searchable.includes("social") || searchable.includes("community")) {
    features.add("community_events");
    features.add("social_lounges");
  }
  if (searchable.includes("group")) features.add("group_ritual");
  if (searchable.includes("therapy") || searchable.includes("recovery")) features.add("recovery_therapy");

  const categories = inferCategories(features);
  const venueId = rawVenue.slug;
  const timestamp = nowIso();

  const canonicalVenue: CanonicalVenue = {
    id: venueId,
    slug: rawVenue.slug,
    name: rawVenue.name,
    city: rawVenue.city,
    region: rawVenue.region,
    country: rawVenue.country,
    coordinates: {
      lat: rawVenue.coordinates?.lat ?? 0,
      lng: rawVenue.coordinates?.lng ?? 0,
    },
    website: rawVenue.website,
    categories,
    features: Array.from(features),
    venue_type: detectVenueType(features),
    source_urls: rawVenue.source_urls ?? [rawVenue.website ?? ""].filter(Boolean),
    editorial_status: "draft",
    ranking_eligibility: {
      is_eligible: false,
      evaluated_at: timestamp,
      reasons: ["Pending scoring and evidence thresholds."],
      blockers: ["No score record generated yet."],
    },
    provenance: {
      discovered_from: "manual",
      last_canonicalized_at: timestamp,
    },
    last_verified_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const confidenceForFeature = (feature: string): number => (features.has(feature) ? 0.8 : 0);
  const evidence = makeEvidence(venueId, rawVenue.name, rawVenue.website, [
    { claim_type: "ritual", claim_key: "ritual_programming", claim_value: confidenceForFeature("ritual_programming") * 10, confidence: 0.7, excerpt: rawVenue.description },
    { claim_type: "ritual", claim_key: "guided_sessions", claim_value: confidenceForFeature("guided_sessions") * 10, confidence: 0.7, excerpt: rawVenue.description },
    { claim_type: "aesthetic", claim_key: "architecture", claim_value: features.has("thermal_pool") ? 7.5 : 5, confidence: 0.6, excerpt: rawVenue.description },
    { claim_type: "social", claim_key: "community_vibe", claim_value: features.has("community_events") ? 8 : 4, confidence: 0.6, excerpt: rawVenue.description },
    { claim_type: "facilities", claim_key: "sauna", claim_value: features.has("sauna") ? 8 : 2, confidence: 0.8, excerpt: rawVenue.description },
    { claim_type: "facilities", claim_key: "cold_plunge", claim_value: features.has("cold_plunge") ? 8 : 1, confidence: 0.8, excerpt: rawVenue.description },
    { claim_type: "recovery", claim_key: "breathwork", claim_value: features.has("breathwork") ? 8 : 3, confidence: 0.65, excerpt: rawVenue.description },
    { claim_type: "factual", claim_key: "website_present", claim_value: Boolean(rawVenue.website), confidence: 0.95, excerpt: rawVenue.website },
  ]);

  const venueValidation = validateCanonicalVenue(canonicalVenue);
  if (!venueValidation.valid) {
    throw new Error(`Canonical venue invalid: ${venueValidation.errors.join("; ")}`);
  }

  const invalidEvidence = evidence
    .map((record) => ({ record, check: validateEvidenceRecord(record) }))
    .filter((item) => !item.check.valid);

  if (invalidEvidence.length) {
    throw new Error(`Evidence invalid: ${invalidEvidence.map((item) => item.check.errors.join(",")).join(" | ")}`);
  }

  return { canonicalVenue, evidence };
}

if (require.main === module) {
  const [inputPath, outputRoot = "data/processed"] = process.argv.slice(2);
  if (!inputPath) throw new Error("Usage: node scripts/ingestion/classifyVenue.ts <raw-venue.json> [output-root]");

  const rawVenue = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")) as RawVenue;
  const { canonicalVenue, evidence } = classifyVenue(rawVenue);

  const venuesDir = path.resolve(outputRoot, "venues");
  const evidenceDir = path.resolve(outputRoot, "evidence");
  fs.mkdirSync(venuesDir, { recursive: true });
  fs.mkdirSync(evidenceDir, { recursive: true });

  const canonicalPath = path.join(venuesDir, `${canonicalVenue.slug}.canonical.json`);
  const evidencePath = path.join(evidenceDir, `${canonicalVenue.slug}.evidence.json`);

  fs.writeFileSync(canonicalPath, `${JSON.stringify(canonicalVenue, null, 2)}\n`, "utf8");
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  process.stdout.write(`Generated ${canonicalPath}\nGenerated ${evidencePath}\n`);
}
