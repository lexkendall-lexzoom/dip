import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSupabaseServiceClient } from "../lib/db/supabase.ts";
import {
  buildSearchFacets,
  buildSearchTags,
  classifyPrimaryCategory,
  createStableSlug,
} from "../lib/schema/canonicalization.ts";
import type { CanonicalVenue, VenueType } from "../lib/schema/models.ts";
import { validateCanonicalVenue } from "../lib/schema/validation.ts";

type SeedVenue = {
  name: string;
  city: string;
  state?: string;
  country: string;
  lat?: number;
  lng?: number;
  website?: string;
  venue_type: string;
  categories: string[];
  features: string[];
  notes?: string;
};

type SeedDataset = SeedVenue[] | { region?: string; venues: SeedVenue[] };

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
const normalize = (v: string): string => v.trim().toLowerCase();

const normalizeVenueType = (venueType: string): VenueType => {
  const normalized = normalize(venueType).replace(/\s+/g, "_");
  if (["bathhouse", "sauna", "contrast_therapy", "spa", "wellness_studio", "other"].includes(normalized)) {
    return normalized as VenueType;
  }
  if (normalized === "wellness_spa") return "wellness_studio";
  return "other";
};

const loadSeedRows = (seedFilePath: string): SeedVenue[] => {
  const dataset = readJson<SeedDataset>(path.resolve(seedFilePath));
  return Array.isArray(dataset) ? dataset : dataset.venues;
};

const toCanonicalVenue = (seed: SeedVenue): CanonicalVenue => {
  const now = new Date().toISOString();
  const slug = createStableSlug(seed.name, seed.city);
  const venueType = normalizeVenueType(seed.venue_type);

  const primaryCategory = classifyPrimaryCategory({
    name: seed.name,
    categories: seed.categories,
    features: seed.features,
    venueType,
  });

  const searchFacets = buildSearchFacets({
    name: seed.name,
    categories: seed.categories,
    features: seed.features,
    venueType,
    existing: undefined,
  });

  const searchTags = buildSearchTags({
    name: seed.name,
    categories: seed.categories,
    features: seed.features,
    primaryCategory,
    venueType,
    facets: searchFacets,
  });

  return {
    id: slug,
    slug,
    name: seed.name,
    city: seed.city,
    region: seed.state,
    country: seed.country,
    coordinates: { lat: seed.lat ?? 0, lng: seed.lng ?? 0 },
    website: seed.website,
    categories: seed.categories,
    features: seed.features,
    venue_type: venueType,
    primary_category: primaryCategory,
    search_facets: searchFacets,
    search_tags: searchTags,
    source_urls: seed.website ? [seed.website] : [],
    editorial_status: "draft",
    ranking_eligibility: {
      is_eligible: false,
      evaluated_at: now,
      reasons: ["Seed import only; awaiting evidence-backed scoring pass."],
      blockers: ["No score record generated yet."],
    },
    last_verified_at: now,
    created_at: now,
    updated_at: now,
  };
};

export async function importSeedVenues(seedFilePath: string, dryRun = false): Promise<void> {
  const seedRows = loadSeedRows(seedFilePath);
  const supabase = dryRun ? null : await createSupabaseServiceClient();

  let inserted = 0;
  let skipped = 0;

  for (const row of seedRows) {
    const canonical = toCanonicalVenue(row);
    const validation = validateCanonicalVenue(canonical);
    if (!validation.valid) {
      throw new Error(`Invalid canonical venue for ${row.name}: ${validation.errors.join("; ")}`);
    }

    if (dryRun) {
      inserted += 1;
      process.stdout.write(`dry-run insert: ${canonical.name}
`);
      continue;
    }

    const { data: existingRows, error: checkError } = await supabase
      .from("venues")
      .select("id,name,city")
      .eq("city", canonical.city);

    if (checkError) {
      throw new Error(`Duplicate check failed for ${row.name}: ${checkError.message}`);
    }

    const exists = (existingRows ?? []).some((existing: { name: string; city: string }) =>
      normalize(existing.name) === normalize(canonical.name)
      && normalize(existing.city) === normalize(canonical.city));

    if (exists) {
      skipped += 1;
      process.stdout.write(`skip duplicate: ${canonical.name} (${canonical.city})
`);
      continue;
    }

    const payload = {
      id: canonical.id,
      name: canonical.name,
      city: canonical.city,
      state: canonical.region ?? null,
      country: canonical.country,
      lat: canonical.coordinates.lat,
      lng: canonical.coordinates.lng,
      website: canonical.website ?? null,
      description: row.notes ?? null,
      venue_type: canonical.venue_type,
      ritual_type: canonical.venue_type,
      categories: canonical.categories,
      features: canonical.features,
      primary_category: canonical.primary_category,
      search_facets: canonical.search_facets,
      search_tags: canonical.search_tags,
      status: canonical.editorial_status,
      created_at: canonical.created_at,
    };

    const { error: insertError } = await supabase.from("venues").insert(payload);
    if (insertError) {
      throw new Error(`Insert failed for ${row.name}: ${insertError.message}`);
    }

    inserted += 1;
  }

  process.stdout.write(`seed import complete: inserted=${inserted}, skipped=${skipped}, dry_run=${dryRun}
`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  const seedPath = args.find((arg) => !arg.startsWith("--")) ?? "data/venues/seed_nyc_hudson.json";
  const dryRun = args.includes("--dry-run");

  importSeedVenues(seedPath, dryRun).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}
`);
    process.exit(1);
  });
}
