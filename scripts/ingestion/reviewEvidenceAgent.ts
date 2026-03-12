import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CanonicalVenue } from "../../lib/schema/models.ts";
import type { ScoreRecord } from "../../lib/schema/models.ts";

type NormalizedReview = {
  source: "google_reviews";
  author: string | null;
  rating: number | null;
  text: string;
  reviewed_at: string | null;
};

type ReviewSignalName =
  | "sauna_quality"
  | "cold_plunge_quality"
  | "cold_plunge_access"
  | "steam_room_quality"
  | "thermal_circuit_quality"
  | "ritual_quality"
  | "cleanliness"
  | "facility_condition"
  | "crowd_density"
  | "staff_friendliness"
  | "design_ambience"
  | "value_perception";

type VenueSignal = {
  signal: ReviewSignalName;
  sentiment: number;
  confidence: number;
  evidence: string;
};

type ReviewEvidenceArtifact = {
  venue_id: string;
  source: string;
  review_count: number;
  signals: VenueSignal[];
};

type ReviewProvider = {
  fetchReviews: (venue: CanonicalVenue) => Promise<NormalizedReview[]>;
  sourceName: string;
};

type AgentOptions = {
  citySlug?: string;
  venueSlug?: string;
  fixturePath?: string;
  dryRun?: boolean;
  outputDir?: string;
};

const SIGNALS: ReviewSignalName[] = [
  "sauna_quality",
  "cold_plunge_quality",
  "cold_plunge_access",
  "steam_room_quality",
  "thermal_circuit_quality",
  "ritual_quality",
  "cleanliness",
  "facility_condition",
  "crowd_density",
  "staff_friendliness",
  "design_ambience",
  "value_perception",
];

const CHUNK_SIZE = 25;
export const MAX_CITY_VENUES = 10;
export const MAX_TOTAL_VENUES = 50;
export const LAUNCH_CITY_SLUGS = ["new-york", "san-francisco", "los-angeles", "miami", "chicago"] as const;
const LAUNCH_CITY_SET = new Set<string>(LAUNCH_CITY_SLUGS);

const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
const round2 = (n: number): number => Number(n.toFixed(2));
const readJson = <T>(p: string): T => JSON.parse(fs.readFileSync(p, "utf8")) as T;
const writeJson = (p: string, data: unknown): void => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const slugify = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const citySlugForVenue = (venue: CanonicalVenue): string => slugify(venue.city);

const loadCanonicalVenues = (): CanonicalVenue[] => {
  const dir = path.resolve("data/processed/venues");
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".canonical.json"));
  return files.map((f) => readJson<CanonicalVenue>(path.join(dir, f)));
};


const canonicalPathForSlug = (slug: string): string => path.resolve("data/processed/venues", `${slug}.canonical.json`);

const updateCanonicalReviewProvenance = (venueSlug: string, reviewSource: string): void => {
  const canonicalPath = canonicalPathForSlug(venueSlug);
  if (!fs.existsSync(canonicalPath)) return;

  const canonical = readJson<CanonicalVenue>(canonicalPath);
  const currentSources = new Set<string>(canonical.provenance?.review_sources ?? []);
  currentSources.add(reviewSource);

  canonical.provenance = {
    discovered_from: canonical.provenance?.discovered_from ?? "unknown",
    enriched_from: canonical.provenance?.enriched_from,
    review_sources: [...currentSources].sort(),
    last_canonicalized_at: canonical.provenance?.last_canonicalized_at ?? canonical.updated_at,
  };
  canonical.updated_at = new Date().toISOString();

  writeJson(canonicalPath, canonical);
};

const loadScores = (): Map<string, number> => {
  const dir = path.resolve("data/processed/scores");
  const out = new Map<string, number>();
  if (!fs.existsSync(dir)) return out;

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".score.json"));
  for (const file of files) {
    const score = readJson<ScoreRecord>(path.join(dir, file));
    if (typeof score.overall === "number") {
      out.set(score.venue_id, score.overall);
    }
  }

  return out;
};

const selectTopCityVenues = (venues: CanonicalVenue[], scores: Map<string, number>): CanonicalVenue[] => {
  const withScore = venues
    .filter((venue) => typeof scores.get(venue.id) === "number")
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));

  const withoutScore = venues
    .filter((venue) => typeof scores.get(venue.id) !== "number")
    .sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));

  return [...withScore, ...withoutScore].slice(0, MAX_CITY_VENUES);
};

const selectLaunchVenues = (allVenues: CanonicalVenue[], citySlug?: string, venueSlug?: string): CanonicalVenue[] => {
  if (venueSlug) {
    return allVenues.filter((venue) => venue.slug === venueSlug);
  }

  const targetCities = citySlug ? [citySlug] : [...LAUNCH_CITY_SLUGS];
  if (citySlug && !LAUNCH_CITY_SET.has(citySlug)) {
    throw new Error(`Unsupported --city '${citySlug}'. Launch scope supports: ${LAUNCH_CITY_SLUGS.join(", ")}.`);
  }

  const scores = loadScores();
  const selected: CanonicalVenue[] = [];

  for (const targetCity of targetCities) {
    const venuesForCity = allVenues.filter((venue) => citySlugForVenue(venue) === targetCity);
    const topVenues = selectTopCityVenues(venuesForCity, scores);
    selected.push(...topVenues);
  }

  return selected
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .slice(0, MAX_TOTAL_VENUES);
};

const dedupeReviews = (reviews: NormalizedReview[]): NormalizedReview[] => {
  const seen = new Set<string>();
  const out: NormalizedReview[] = [];
  for (const r of reviews) {
    const key = norm(r.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
};

const chunk = <T>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const keywordMap: Record<ReviewSignalName, string[]> = {
  sauna_quality: ["sauna", "heat", "temperature", "wood fired"],
  cold_plunge_quality: ["cold plunge", "plunge", "ice bath"],
  cold_plunge_access: ["line", "wait", "crowded", "access", "queue"],
  steam_room_quality: ["steam room", "steam"],
  thermal_circuit_quality: ["thermal", "circuit", "pools", "hot pool"],
  ritual_quality: ["ritual", "guided", "facilitator", "aufguss", "ceremony"],
  cleanliness: ["clean", "hygiene", "dirty", "filthy", "spotless"],
  facility_condition: ["condition", "maintained", "broken", "repair", "new"],
  crowd_density: ["crowded", "packed", "busy", "quiet", "empty"],
  staff_friendliness: ["staff", "service", "friendly", "rude", "welcoming"],
  design_ambience: ["design", "ambience", "atmosphere", "lighting", "beautiful"],
  value_perception: ["price", "value", "expensive", "worth", "overpriced"],
};

const positiveWords = ["great", "excellent", "amazing", "clean", "beautiful", "friendly", "worth", "love", "best", "relaxing"];
const negativeWords = ["bad", "terrible", "dirty", "rude", "expensive", "overpriced", "crowded", "broken", "worst", "wait"];

const reviewSentiment = (review: NormalizedReview): number => {
  const t = norm(review.text);
  const pos = positiveWords.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
  const neg = negativeWords.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
  const ratingSignal = review.rating ? (review.rating - 3) / 2 : 0;
  return clamp((pos - neg) * 0.2 + ratingSignal, -1, 1);
};

// LLM-step abstraction: deterministic schema-compatible extraction with optional live LLM integration later.
const extractSignalsFromChunk = (reviews: NormalizedReview[]): VenueSignal[] => {
  const signals: VenueSignal[] = [];
  for (const signal of SIGNALS) {
    const keys = keywordMap[signal];
    const matched = reviews.filter((r) => keys.some((k) => norm(r.text).includes(k)));
    if (matched.length === 0) continue;

    const sentiment = round2(matched.map(reviewSentiment).reduce((a, b) => a + b, 0) / matched.length);
    const confidence = round2(clamp((matched.length / Math.max(3, reviews.length)) * 0.8, 0.2, 0.85));
    signals.push({
      signal,
      sentiment,
      confidence,
      evidence: `${matched.length} reviews mention ${signal.replace(/_/g, " ")}.`,
    });
  }
  return signals;
};

const aggregateChunkSignals = (chunkSignals: VenueSignal[], reviewCount: number): VenueSignal[] => {
  const grouped = new Map<ReviewSignalName, VenueSignal[]>();
  for (const signal of chunkSignals) {
    const arr = grouped.get(signal.signal) ?? [];
    arr.push(signal);
    grouped.set(signal.signal, arr);
  }

  const out: VenueSignal[] = [];
  for (const signal of SIGNALS) {
    const arr = grouped.get(signal);
    if (!arr || arr.length === 0) continue;
    const weighted = arr.reduce((acc, row) => {
      acc.sent += row.sentiment * row.confidence;
      acc.weight += row.confidence;
      return acc;
    }, { sent: 0, weight: 0 });

    const confidenceBase = weighted.weight / arr.length;
    const reviewWeight = clamp(reviewCount / 80, 0.1, 1);
    const confidence = round2(clamp(confidenceBase * reviewWeight, 0.15, 0.9));

    out.push({
      signal,
      sentiment: round2(weighted.weight ? weighted.sent / weighted.weight : 0),
      confidence,
      evidence: arr.map((a) => a.evidence).slice(0, 2).join(" "),
    });
  }

  return out;
};

type ReviewFixturePayload = NormalizedReview[] | Record<string, NormalizedReview[]>;

const fixtureProvider = (fixturePath: string): ReviewProvider => ({
  sourceName: "google_reviews",
  fetchReviews: async (venue) => {
    const payload = readJson<ReviewFixturePayload>(path.resolve(fixturePath));
    if (Array.isArray(payload)) return payload;
    return payload[venue.slug] ?? payload.__default ?? [];
  },
});

const outscraperProvider = (): ReviewProvider => ({
  sourceName: "google_reviews",
  fetchReviews: async (venue) => {
    const apiKey = process.env.OUTSCRAPER_API_KEY;
    if (!apiKey) throw new Error("Missing OUTSCRAPER_API_KEY for live review ingestion.");

    const body = {
      query: [venue.name, venue.city, venue.country].filter(Boolean).join(", "),
      reviewsLimit: 120,
      language: "en",
    };

    const res = await fetch("https://api.app.outscraper.com/maps/reviews-v3", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Outscraper request failed (${res.status}).`);
    }

    const payload = await res.json() as Array<{ reviews?: Array<{ reviewer_name?: string; rating?: number; review_text?: string; review_datetime_utc?: string }> }>;
    const reviews = payload.flatMap((p) => p.reviews ?? []);

    return reviews
      .filter((r) => (r.review_text ?? "").trim().length > 0)
      .map((r) => ({
        source: "google_reviews",
        author: r.reviewer_name ?? null,
        rating: typeof r.rating === "number" ? r.rating : null,
        text: r.review_text ?? "",
        reviewed_at: r.review_datetime_utc ?? null,
      }));
  },
});

const createProvider = (fixturePath?: string): ReviewProvider => {
  if (fixturePath) return fixtureProvider(fixturePath);
  return outscraperProvider();
};

export async function runReviewEvidenceAgent(options: AgentOptions): Promise<ReviewEvidenceArtifact[]> {
  const provider = createProvider(options.fixturePath);
  const outputDir = options.outputDir ?? "data/processed/evidence";

  const venues = selectLaunchVenues(loadCanonicalVenues(), options.citySlug, options.venueSlug);
  process.stdout.write(`Selected ${venues.length} venue(s) for review evidence processing.\n`);
  if (venues.length > 0) {
    process.stdout.write(`Selected venue slugs: ${venues.map((venue) => venue.slug).join(", ")}\n`);
  }
  const artifacts: ReviewEvidenceArtifact[] = [];

  for (const venue of venues) {
    const fetched = await provider.fetchReviews(venue);
    const reviews = dedupeReviews(fetched);

    const chunkSignals = chunk(reviews, CHUNK_SIZE).flatMap((reviewsChunk) => extractSignalsFromChunk(reviewsChunk));
    const signals = aggregateChunkSignals(chunkSignals, reviews.length);

    const artifact: ReviewEvidenceArtifact = {
      venue_id: venue.slug,
      source: provider.sourceName,
      review_count: reviews.length,
      signals,
    };

    artifacts.push(artifact);

    if (!options.dryRun) {
      const outPath = path.resolve(outputDir, `${venue.slug}.reviews.evidence.json`);
      writeJson(outPath, artifact);
      updateCanonicalReviewProvenance(venue.slug, provider.sourceName);
      process.stdout.write(`Wrote ${outPath}\n`);
    }
  }

  return artifacts;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  const city = args.includes("--city") ? args[args.indexOf("--city") + 1] : undefined;
  const venue = args.includes("--venue") ? args[args.indexOf("--venue") + 1] : undefined;
  const fixture = args.includes("--fixture") ? args[args.indexOf("--fixture") + 1] : undefined;
  const dryRun = args.includes("--dry-run");

  runReviewEvidenceAgent({
    citySlug: city,
    venueSlug: venue,
    fixturePath: fixture,
    dryRun,
  }).then((artifacts) => {
    process.stdout.write(`Review evidence artifacts: ${artifacts.length}\n`);
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
