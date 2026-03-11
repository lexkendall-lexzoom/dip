import type { CandidateVenueRaw, CanonicalVenue, VenueType } from "./models.ts";

export type AmbiguousDuplicate = {
  city: string;
  candidate_a: Pick<CandidateVenueRaw, "name" | "website" | "address" | "source_urls">;
  candidate_b: Pick<CandidateVenueRaw, "name" | "website" | "address" | "source_urls">;
  reason: string;
  similarity_score: number;
};

const stripProtocol = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const createStableSlug = (name: string, city: string): string => {
  const base = `${normalizeText(name)} ${normalizeText(city)}`.trim();
  return base
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
};

export const normalizeWebsite = (website?: string): string | undefined => {
  if (!website) return undefined;
  return stripProtocol(website);
};

export const normalizeAddress = (address?: string): string | undefined => {
  if (!address) return undefined;
  return normalizeText(address);
};

export const normalizedName = (name: string): string => normalizeText(name);

const tokenSet = (value: string): Set<string> => new Set(normalizeText(value).split(" ").filter(Boolean));

export const jaccardSimilarity = (a: string, b: string): number => {
  const aSet = tokenSet(a);
  const bSet = tokenSet(b);
  const union = new Set([...aSet, ...bSet]);
  if (!union.size) return 0;

  let intersectionCount = 0;
  union.forEach((token) => {
    if (aSet.has(token) && bSet.has(token)) {
      intersectionCount += 1;
    }
  });

  return Number((intersectionCount / union.size).toFixed(2));
};

export const areClearDuplicates = (a: CandidateVenueRaw, b: CandidateVenueRaw): boolean => {
  const aWebsite = normalizeWebsite(a.website);
  const bWebsite = normalizeWebsite(b.website);

  if (aWebsite && bWebsite && aWebsite === bWebsite) return true;

  const sameCity = normalizeText(a.city) === normalizeText(b.city);
  const nameMatch = normalizedName(a.name) === normalizedName(b.name);
  const aAddress = normalizeAddress(a.address);
  const bAddress = normalizeAddress(b.address);
  const addressMatch = Boolean(aAddress && bAddress && aAddress === bAddress);

  return sameCity && (nameMatch || addressMatch);
};

export const getAmbiguousDuplicate = (a: CandidateVenueRaw, b: CandidateVenueRaw): AmbiguousDuplicate | null => {
  if (areClearDuplicates(a, b)) return null;

  const sameCity = normalizeText(a.city) === normalizeText(b.city);
  if (!sameCity) return null;

  const similarity = jaccardSimilarity(a.name, b.name);
  if (similarity < 0.65) return null;

  return {
    city: a.city,
    candidate_a: { name: a.name, website: a.website, address: a.address, source_urls: a.source_urls },
    candidate_b: { name: b.name, website: b.website, address: b.address, source_urls: b.source_urls },
    reason: "Name similarity in same city exceeds ambiguity threshold.",
    similarity_score: similarity,
  };
};

export const inferVenueType = (categories: string[]): VenueType => {
  const normalized = categories.map((category) => category.toLowerCase());

  if (normalized.some((category) => category.includes("contrast"))) return "contrast_therapy";
  if (normalized.some((category) => category.includes("bathhouse") || category.includes("hammam"))) return "bathhouse";
  if (normalized.some((category) => category.includes("sauna"))) return "sauna";
  if (normalized.some((category) => category.includes("spa"))) return "spa";
  return "other";
};

export const toCanonicalVenue = (
  candidate: CandidateVenueRaw,
  existing?: CanonicalVenue
): CanonicalVenue => {
  const timestamp = new Date().toISOString();
  const slug = existing?.slug ?? createStableSlug(candidate.name, candidate.city);

  return {
    id: existing?.id ?? slug,
    slug,
    name: existing?.name ?? candidate.name,
    city: candidate.city,
    country: candidate.country,
    coordinates: existing?.coordinates ?? { lat: 0, lng: 0 },
    website: existing?.website ?? candidate.website,
    categories: Array.from(new Set([...(existing?.categories ?? []), ...candidate.candidate_categories])),
    features: existing?.features ?? [],
    venue_type: existing?.venue_type ?? inferVenueType(candidate.candidate_categories),
    source_urls: Array.from(new Set([...(existing?.source_urls ?? []), ...candidate.source_urls])),
    editorial_status: existing?.editorial_status ?? "draft",
    ranking_eligibility: {
      is_eligible: existing?.ranking_eligibility?.is_eligible ?? false,
      evaluated_at: existing?.ranking_eligibility?.evaluated_at ?? timestamp,
      reasons: existing?.ranking_eligibility?.reasons ?? ["Awaiting evidence-backed scoring pass."],
      blockers: existing?.ranking_eligibility?.blockers ?? ["No score record generated yet."],
    },
    last_verified_at: timestamp,
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
  };
};
