import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { CanonicalVenue, EvidenceRecord, SourceType } from "../../lib/schema/models.ts";
import { validateCanonicalVenue, validateEvidenceRecord } from "../../lib/schema/validation.ts";

type SourcePayload = {
  source_type: SourceType;
  source_url: string;
  source_label: string;
  text?: string;
  structured?: Record<string, unknown>;
};

type ExtractionInput = {
  canonical: CanonicalVenue;
  sources: SourcePayload[];
};

type DraftClaim = {
  claim_type: EvidenceRecord["claim_type"];
  claim_key: string;
  claim_value: string | number | boolean;
  confidence: number;
  excerpt: string;
};

const AGENT_NAME = "evidence-extraction-agent-v1";

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;

const asArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);

const clampConfidence = (value: number): number => Math.max(0, Math.min(1, Number(value.toFixed(2))));

const sourceText = (source: SourcePayload): string => {
  const structuredText = source.structured ? JSON.stringify(source.structured) : "";
  return `${source.text ?? ""} ${structuredText}`.trim();
};

const addKeywordClaims = (text: string): DraftClaim[] => {
  const haystack = text.toLowerCase();
  const claims: DraftClaim[] = [];

  if (/ritual|aufguss|ceremony|hammam/.test(haystack)) {
    claims.push({
      claim_type: "ritual",
      claim_key: "ritual_programming",
      claim_value: 8,
      confidence: 0.72,
      excerpt: text,
    });
  }

  if (/design|architecture|interior|lighting|materials/.test(haystack)) {
    claims.push({
      claim_type: "aesthetic",
      claim_key: "design_quality",
      claim_value: 7.8,
      confidence: 0.68,
      excerpt: text,
    });
  }

  if (/social|community|group|event/.test(haystack)) {
    claims.push({
      claim_type: "social",
      claim_key: "community_vibe",
      claim_value: 7.2,
      confidence: 0.64,
      excerpt: text,
    });
  }

  if (/sauna|steam|plunge|thermal|pool|bath/.test(haystack)) {
    claims.push({
      claim_type: "facilities",
      claim_key: "facility_completeness",
      claim_value: 8.1,
      confidence: 0.75,
      excerpt: text,
    });
  }

  if (/massage|breathwork|class|recovery|wellness/.test(haystack)) {
    claims.push({
      claim_type: "recovery",
      claim_key: "recovery_programming",
      claim_value: 7.4,
      confidence: 0.66,
      excerpt: text,
    });
  }

  return claims;
};

const buildFactualClaims = (venue: CanonicalVenue): DraftClaim[] => [
  {
    claim_type: "factual",
    claim_key: "website_present",
    claim_value: Boolean(venue.website),
    confidence: 0.99,
    excerpt: venue.website ?? "",
  },
  {
    claim_type: "factual",
    claim_key: "source_url_count",
    claim_value: venue.source_urls.length,
    confidence: 0.95,
    excerpt: venue.source_urls.join(", "),
  },
  {
    claim_type: "factual",
    claim_key: "venue_type",
    claim_value: venue.venue_type,
    confidence: 0.98,
    excerpt: venue.venue_type,
  },
];

const dedupeClaims = (claims: Array<{ source: SourcePayload; claim: DraftClaim }>) => {
  const deduped = new Map<string, { source: SourcePayload; claim: DraftClaim }>();

  claims.forEach((entry) => {
    const key = [entry.source.source_url, entry.claim.claim_type, entry.claim.claim_key, String(entry.claim.claim_value)].join("::");
    if (!deduped.has(key)) deduped.set(key, entry);
  });

  return Array.from(deduped.values());
};

const normalizeSources = (venue: CanonicalVenue, rawSources?: SourcePayload[]): SourcePayload[] => {
  if (rawSources && rawSources.length > 0) {
    return rawSources.map((source) => ({
      ...source,
      source_type: source.source_type,
      source_url: source.source_url,
      source_label: source.source_label,
    }));
  }

  return venue.source_urls.map((sourceUrl) => ({
    source_type: "aggregator",
    source_url: sourceUrl,
    source_label: "Canonical source URL",
    text: `${venue.name} in ${venue.city}. Categories: ${venue.categories.join(", ")}.`,
  }));
};

export function extractEvidence(input: ExtractionInput): EvidenceRecord[] {
  const venueValidation = validateCanonicalVenue(input.canonical);
  if (!venueValidation.valid) {
    throw new Error(`Canonical venue invalid (${input.canonical.slug}): ${venueValidation.errors.join("; ")}`);
  }

  const extractedAt = new Date().toISOString();
  const sources = normalizeSources(input.canonical, input.sources);

  const claimRows: Array<{ source: SourcePayload; claim: DraftClaim }> = [];

  sources.forEach((source) => {
    const text = sourceText(source);
    addKeywordClaims(text).forEach((claim) => claimRows.push({ source, claim }));
  });

  const factualSource: SourcePayload = {
    source_type: "manual",
    source_url: input.canonical.source_urls[0] ?? "https://dipdays.local/unknown",
    source_label: "Canonical venue metadata",
    text: `${input.canonical.name} canonical metadata`,
  };

  buildFactualClaims(input.canonical).forEach((claim) => claimRows.push({ source: factualSource, claim }));

  return dedupeClaims(claimRows).map((entry, index) => {
    const record: EvidenceRecord = {
      id: `${input.canonical.id}-ev-${index + 1}`,
      venue_id: input.canonical.id,
      source_type: entry.source.source_type,
      source_url: entry.source.source_url,
      source_label: entry.source.source_label,
      extracted_at: extractedAt,
      claim_type: entry.claim.claim_type,
      claim_key: entry.claim.claim_key,
      claim_value: entry.claim.claim_value,
      confidence: clampConfidence(entry.claim.confidence),
      excerpt: entry.claim.excerpt.slice(0, 500),
      agent_name: AGENT_NAME,
      human_verified: false,
    };

    const validation = validateEvidenceRecord(record);
    if (!validation.valid) {
      throw new Error(`Evidence record invalid (${record.id}): ${validation.errors.join("; ")}`);
    }

    return record;
  });
}

const listCanonicalFiles = (inputPath: string): string[] => {
  const resolved = path.resolve(inputPath);
  if (!fs.existsSync(resolved)) throw new Error(`Input path does not exist: ${resolved}`);

  const stat = fs.statSync(resolved);
  if (stat.isFile()) return [resolved];

  return fs.readdirSync(resolved)
    .filter((fileName) => fileName.endsWith(".canonical.json"))
    .map((fileName) => path.join(resolved, fileName));
};

const sourcePayloadPathForSlug = (sourceDir: string, slug: string): string => path.resolve(sourceDir, `${slug}.sources.json`);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const [canonicalInput = "data/processed/venues", sourceInput = "data/raw/sources", outputDir = "data/processed/evidence"] = process.argv.slice(2);

  const canonicalFiles = listCanonicalFiles(canonicalInput);
  fs.mkdirSync(path.resolve(outputDir), { recursive: true });

  canonicalFiles.forEach((canonicalFile) => {
    const canonical = readJson<CanonicalVenue>(canonicalFile);
    const sourceFile = sourcePayloadPathForSlug(sourceInput, canonical.slug);
    const sources = fs.existsSync(sourceFile) ? asArray(readJson<SourcePayload | SourcePayload[]>(sourceFile)) : [];

    const evidence = extractEvidence({ canonical, sources });
    const outputPath = path.resolve(outputDir, `${canonical.slug}.evidence.json`);
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

    process.stdout.write(`Wrote ${outputPath} (${evidence.length} records)\n`);
  });
}
