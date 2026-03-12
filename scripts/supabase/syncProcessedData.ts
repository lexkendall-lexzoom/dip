import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSupabaseServiceClient } from "../../lib/db/supabase.ts";
import { isUuid } from "../../lib/schema/identity.ts";
import type { CanonicalVenue, EvidenceRecord, ScoreRecord } from "../../lib/schema/models.ts";
import { validateCanonicalVenue, validateEvidenceRecord, validateScoreRecord } from "../../lib/schema/validation.ts";

const BATCH_SIZE = 250;

type SyncSummary = {
  venues: number;
  evidence: number;
  scores: number;
  facilities: number;
};

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const listCanonicalByCity = (citySlug: string): CanonicalVenue[] => {
  const directory = path.resolve("data/processed/venues");
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory)
    .filter((file) => file.endsWith(".canonical.json"))
    .map((file) => readJson<CanonicalVenue>(path.join(directory, file)))
    .filter((venue) => toSlug(venue.city) === citySlug || venue.slug.endsWith(`-${citySlug}`));
};

const readEvidenceBySlug = (slug: string): EvidenceRecord[] => {
  const evidencePath = path.resolve("data/processed/evidence", `${slug}.evidence.json`);
  if (!fs.existsSync(evidencePath)) return [];
  return readJson<EvidenceRecord[]>(evidencePath);
};

const readScoreByVenueId = (venueId: string): ScoreRecord | null => {
  const idScorePath = path.resolve("data/processed/scores", `${venueId}.score.json`);
  if (fs.existsSync(idScorePath)) {
    return readJson<ScoreRecord>(idScorePath);
  }

  const scoreDir = path.resolve("data/processed/scores");
  if (!fs.existsSync(scoreDir)) return null;

  const candidates = fs.readdirSync(scoreDir)
    .filter((file) => file.endsWith(".score.json"));

  for (const file of candidates) {
    const score = readJson<ScoreRecord>(path.join(scoreDir, file));
    if (score.venue_id === venueId) {
      return score;
    }
  }

  return null;
};

const inferFacilities = (venue: CanonicalVenue, evidence: EvidenceRecord[]) => {
  const featureSet = new Set(venue.features.map((feature) => feature.toLowerCase().trim()));
  const factual = evidence.filter((row) => row.claim_type === "factual" || row.claim_type === "facilities");

  const numericClaim = (keys: string[]): number | null => {
    for (const key of keys) {
      const found = factual.find((row) => row.claim_key.toLowerCase() === key && typeof row.claim_value === "number");
      if (found && typeof found.claim_value === "number") return found.claim_value;
    }
    return null;
  };

  const booleanClaim = (keys: string[]): boolean | null => {
    for (const key of keys) {
      const found = factual.find((row) => row.claim_key.toLowerCase() === key && typeof row.claim_value === "boolean");
      if (found && typeof found.claim_value === "boolean") return found.claim_value;
    }
    return null;
  };

  return {
    id: venue.id,
    venue_id: venue.id,
    sauna_count: numericClaim(["sauna_count", "sauna_rooms", "saunas"]) ?? null,
    cold_plunge: booleanClaim(["cold_plunge", "ice_bath"]) ?? featureSet.has("cold plunge"),
    steam_room: booleanClaim(["steam_room", "steam"]) ?? featureSet.has("steam room"),
    pool: booleanClaim(["pool", "thermal_pool"]) ?? featureSet.has("pool"),
    treatments: booleanClaim(["treatments", "massage"]) ?? featureSet.has("massage"),
  };
};

const failMalformed = (message: string, context: Record<string, unknown>): never => {
  throw new Error(`${message} ${JSON.stringify(context)}`);
};

async function upsertBatches(
  supabase: Awaited<ReturnType<typeof createSupabaseServiceClient>>,
  table: string,
  rows: Array<Record<string, unknown>>,
  onConflict: string,
): Promise<void> {
  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict });

    if (error) {
      throw new Error(`supabase upsert failed [${table}]: ${error.message}`);
    }
  }
}

export async function syncProcessedData(citySlug: string): Promise<SyncSummary> {
  const venues = listCanonicalByCity(citySlug);

  venues.forEach((venue) => {
    const validation = validateCanonicalVenue(venue);
    if (!validation.valid) {
      failMalformed("Invalid canonical venue encountered during sync.", { slug: venue.slug, errors: validation.errors });
    }
  });

  const venueRows = venues.map((venue) => ({
    id: venue.id,
    slug: venue.slug,
    name: venue.name,
    city: venue.city,
    country: venue.country,
    lat: venue.coordinates.lat,
    lng: venue.coordinates.lng,
    website: venue.website ?? null,
    description: null,
    venue_type: venue.venue_type,
    ritual_type: venue.venue_type,
    categories: venue.categories,
    features: venue.features,
    primary_category: venue.primary_category,
    search_facets: venue.search_facets,
    search_tags: venue.search_tags,
    status: venue.editorial_status,
    created_at: venue.created_at,
  }));

  const evidenceRows = venues.flatMap((venue) =>
    readEvidenceBySlug(venue.slug).map((record) => {
      const validation = validateEvidenceRecord(record);
      if (!validation.valid) {
        failMalformed("Invalid evidence record encountered during sync.", {
          venue_slug: venue.slug,
          record_id: record.id,
          errors: validation.errors,
        });
      }
      if (record.venue_id !== venue.id) {
        failMalformed("Evidence venue_id mismatch encountered during sync.", {
          venue_slug: venue.slug,
          expected_venue_id: venue.id,
          actual_venue_id: record.venue_id,
          record_id: record.id,
        });
      }

      return {
        id: record.id,
        venue_id: venue.id,
        source: `${record.source_type}:${record.source_label}`,
        rating: typeof record.claim_value === "number" ? record.claim_value : null,
        text: record.excerpt ?? String(record.claim_value),
        author: record.agent_name ?? null,
        created_at: record.extracted_at,
      };
    }));

  const scoreRows = venues
    .map((venue) => {
      const score = readScoreByVenueId(venue.id);
      if (!score) return null;

      const validation = validateScoreRecord(score);
      if (!validation.valid) {
        failMalformed("Invalid score record encountered during sync.", {
          venue_slug: venue.slug,
          expected_venue_id: venue.id,
          score_venue_id: score.venue_id,
          errors: validation.errors,
        });
      }
      if (score.venue_id !== venue.id) {
        failMalformed("Score venue_id mismatch encountered during sync.", {
          venue_slug: venue.slug,
          expected_venue_id: venue.id,
          score_venue_id: score.venue_id,
        });
      }

      return {
        venue_id: score.venue_id,
        facilities_score: score.facilities,
      };
    })
    .filter((score): score is { venue_id: string; facilities_score: number } => Boolean(score));

  const facilitiesRows = venues.map((venue) => inferFacilities(venue, readEvidenceBySlug(venue.slug)));
  facilitiesRows.forEach((row) => {
    if (!isUuid(row.id) || !isUuid(row.venue_id)) {
      failMalformed("Facilities row has non-UUID identifiers.", row);
    }
  });

  const supabase = await createSupabaseServiceClient();

  await upsertBatches(supabase, "venues", venueRows, "id");
  await upsertBatches(supabase, "facilities", facilitiesRows, "id");
  await upsertBatches(supabase, "reviews", evidenceRows, "id");
  await upsertBatches(supabase, "scores", scoreRows, "venue_id");

  return {
    venues: venueRows.length,
    facilities: facilitiesRows.length,
    evidence: evidenceRows.length,
    scores: scoreRows.length,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const citySlug = process.argv[2];
  if (!citySlug) {
    process.stderr.write("Usage: tsx scripts/supabase/syncProcessedData.ts <city-slug>\n");
    process.exit(1);
  }

  syncProcessedData(citySlug)
    .then((summary) => {
      process.stdout.write(`synced venues: ${summary.venues}\n`);
      process.stdout.write(`synced evidence (reviews table): ${summary.evidence}\n`);
      process.stdout.write(`synced scores: ${summary.scores}\n`);
      process.stdout.write(`synced facilities: ${summary.facilities}\n`);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exit(1);
    });
}
