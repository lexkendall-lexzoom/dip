import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CandidateVenueRaw } from "../../lib/schema/models.ts";

type EnrichedCandidate = CandidateVenueRaw & {
  osm_id?: string;
  phone?: string;
  sources?: Array<{ provider: "google_places"; place_id: string; fields: Record<string, unknown> }>;
};

type GoogleTextResult = { places?: Array<{ id?: string; displayName?: { text?: string } }> };
type GoogleDetails = { websiteUri?: string; nationalPhoneNumber?: string; formattedAddress?: string; regularOpeningHours?: unknown; rating?: number; userRatingCount?: number };

type Options = {
  citySlug: string;
  skipGoogle?: boolean;
  fixturePath?: string;
};

const readJson = <T>(p: string): T => JSON.parse(fs.readFileSync(p, "utf8")) as T;
const writeJson = (p: string, v: unknown): void => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`, "utf8");
};
const nowIso = (): string => new Date().toISOString();

const inPath = (citySlug: string): string => path.resolve("data/processed/discovery", `${citySlug}.json`);
const outPath = (citySlug: string): string => path.resolve("data/processed/discovery_enriched", `${citySlug}.json`);
const cachePath = (citySlug: string): string => path.resolve("data/processed/discovery_enriched", `${citySlug}.cache.json`);

const needsEnrichment = (c: EnrichedCandidate): boolean => !c.website || !c.address || !c.phone;

async function googleLookup(textQuery: string, apiKey: string): Promise<{ placeId?: string; details?: GoogleDetails }> {
  const search = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName",
    },
    body: JSON.stringify({ textQuery, pageSize: 1 }),
  });
  if (!search.ok) {
    throw new Error(`Google text search failed: ${search.status}`);
  }

  const searchJson = await search.json() as GoogleTextResult;
  const placeId = searchJson.places?.[0]?.id;
  if (!placeId) return {};

  const details = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "websiteUri",
        "nationalPhoneNumber",
        "formattedAddress",
        "regularOpeningHours",
        "rating",
        "userRatingCount",
      ].join(","),
    },
  });
  if (!details.ok) {
    throw new Error(`Google place details failed: ${details.status}`);
  }

  return { placeId, details: await details.json() as GoogleDetails };
}

export async function runGoogleEnrich(options: Options): Promise<{ candidates: EnrichedCandidate[]; outputPath: string }> {
  const candidates = readJson<EnrichedCandidate[]>(inPath(options.citySlug));
  const skip = options.skipGoogle || !process.env.GOOGLE_PLACES_API_KEY;
  const fixture = options.fixturePath ? readJson<{ place_id: string; details: GoogleDetails }>(path.resolve(options.fixturePath)) : null;

  const cache = fs.existsSync(cachePath(options.citySlug))
    ? readJson<Record<string, { place_id: string; details: GoogleDetails }>>(cachePath(options.citySlug))
    : {};

  const enriched: EnrichedCandidate[] = [];

  for (const candidate of candidates) {
    if (skip || !needsEnrichment(candidate)) {
      enriched.push(candidate);
      continue;
    }

    const cacheKey = `${options.citySlug}:${candidate.osm_id ?? candidate.name}`;
    let hit = cache[cacheKey];

    if (!hit) {
      if (fixture) {
        hit = fixture;
      } else {
        const query = [candidate.name, candidate.city, candidate.country].filter(Boolean).join(", ");
        const result = await googleLookup(query, process.env.GOOGLE_PLACES_API_KEY as string);
        if (result.placeId && result.details) {
          hit = { place_id: result.placeId, details: result.details };
        }
      }
    }

    if (!hit) {
      enriched.push(candidate);
      continue;
    }

    cache[cacheKey] = hit;
    enriched.push({
      ...candidate,
      website: candidate.website ?? hit.details.websiteUri,
      phone: candidate.phone ?? hit.details.nationalPhoneNumber,
      address: candidate.address ?? hit.details.formattedAddress,
      enrichment_sources: Array.from(new Set([...(candidate.enrichment_sources ?? []), "google_places"])),
      source_provenance: [
        ...(candidate.source_provenance ?? []),
        {
          source_type: "aggregator",
          source_url: `https://maps.google.com/?cid=${hit.place_id}`,
          source_label: "Google Places enrichment",
          discovered_at: nowIso(),
        },
      ],
      sources: [
        ...(candidate.sources ?? []),
        {
          provider: "google_places",
          place_id: hit.place_id,
          fields: {
            websiteUri: hit.details.websiteUri,
            nationalPhoneNumber: hit.details.nationalPhoneNumber,
            formattedAddress: hit.details.formattedAddress,
            rating: hit.details.rating,
            userRatingCount: hit.details.userRatingCount,
            regularOpeningHours: hit.details.regularOpeningHours,
          },
        },
      ],
    });
  }

  writeJson(cachePath(options.citySlug), cache);
  writeJson(outPath(options.citySlug), enriched);
  return { candidates: enriched, outputPath: outPath(options.citySlug) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const citySlug = args.find((arg) => !arg.startsWith("--"));
  if (!citySlug) throw new Error("Usage: node scripts/ingestion/googleEnrich.ts <city-slug> [--skip-google] [--fixture=path]");
  const fixtureArg = args.find((arg) => arg.startsWith("--fixture="));
  runGoogleEnrich({
    citySlug,
    skipGoogle: args.includes("--skip-google"),
    fixturePath: fixtureArg ? fixtureArg.split("=")[1] : undefined,
  }).then(({ candidates, outputPath }) => {
    process.stdout.write(`Enriched candidates: ${candidates.length}\n`);
    process.stdout.write(`Output path: ${outputPath}\n`);
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
