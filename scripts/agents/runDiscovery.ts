import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import type { CandidateVenueRaw } from "../../lib/schema/models.ts";
import { runOsmDiscovery } from "../ingestion/osmDiscovery.ts";
import { runGoogleEnrich } from "../ingestion/googleEnrich.ts";

type SeedSource = { source_label: string; source_url: string };
type ManualCandidate = { name: string; website?: string; address?: string; snippets?: string[]; source_urls?: string[] };
type CityDiscoveryConfig = {
  city: string;
  city_slug: string;
  content_city_slug?: string;
  country: string;
  seed_sources?: SeedSource[];
  manual_candidates?: ManualCandidate[];
  max_candidates?: number;
};

type VenueContentRecord = {
  name?: string;
  website?: string;
  address?: string;
  categories?: string[];
  description?: string;
};

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
const nowIso = () => new Date().toISOString();

const normalizeKey = (candidate: Pick<CandidateVenueRaw, "name" | "website" | "address">): string => {
  const normalizedName = candidate.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedWebsite = (candidate.website ?? "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const normalizedAddress = (candidate.address ?? "").toLowerCase().trim();
  return `${normalizedName}::${normalizedWebsite || normalizedAddress}`;
};

const inferCandidateCategories = (text: string): string[] => {
  const haystack = text.toLowerCase();
  const categories = new Set<string>();
  if (/sauna|banya/.test(haystack)) categories.add("Sauna");
  if (/hammam|hamam|turkish bath/.test(haystack)) categories.add("Hammam");
  if (/bathhouse|thermal|hot spring/.test(haystack)) categories.add("Bathhouse");
  if (/cold plunge|contrast|ice bath/.test(haystack)) categories.add("Contrast Therapy");
  return Array.from(categories);
};

const fromContentDirectory = (config: CityDiscoveryConfig): CandidateVenueRaw[] => {
  const citySlug = config.content_city_slug ?? config.city_slug;
  const directory = path.resolve("content/venues", citySlug);
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .map((file) => {
      const sourceFilePath = path.join(directory, file);
      const raw = yaml.load(fs.readFileSync(sourceFilePath, "utf8")) as VenueContentRecord;
      const localSourceUrl = `file://${sourceFilePath}`;
      return {
        name: raw.name ?? file.replace(/\.ya?ml$/i, ""),
        website: raw.website,
        address: raw.address,
        city: config.city,
        country: config.country,
        source_urls: [localSourceUrl, ...(raw.website ? [raw.website] : [])],
        snippets: [{ source_url: localSourceUrl, text: raw.description ?? `${raw.name ?? "Venue"} in ${config.city}` }],
        candidate_categories: raw.categories?.length ? raw.categories : inferCandidateCategories([raw.name, raw.description].filter(Boolean).join(" ")),
        source_provenance: [{
          source_type: "directory_seed",
          source_url: localSourceUrl,
          source_label: "Existing DipDays venue directory",
          discovered_at: nowIso(),
        }],
      };
    });
};

const fromManualCandidates = (config: CityDiscoveryConfig): CandidateVenueRaw[] =>
  (config.manual_candidates ?? []).map((candidate) => {
    const seedSource = config.seed_sources?.[0];
    const sourceUrl = candidate.source_urls?.[0] ?? seedSource?.source_url ?? "https://example.com";
    return {
      name: candidate.name,
      website: candidate.website,
      address: candidate.address,
      city: config.city,
      country: config.country,
      source_urls: Array.from(new Set([...(candidate.source_urls ?? []), ...(candidate.website ? [candidate.website] : []), sourceUrl])),
      snippets: (candidate.snippets ?? [`Discovered candidate venue in ${config.city}.`]).map((text) => ({ source_url: sourceUrl, text })),
      candidate_categories: inferCandidateCategories([candidate.name, ...(candidate.snippets ?? [])].join(" ")),
      source_provenance: [{
        source_type: "manual",
        source_url: sourceUrl,
        source_label: seedSource?.source_label ?? "Manual city seed",
        discovered_at: nowIso(),
      }],
    };
  });

export async function runDiscovery(config: CityDiscoveryConfig): Promise<CandidateVenueRaw[]> {
  const osm = await runOsmDiscovery({
    citySlug: config.city_slug,
    resume: true,
    fixturePath: process.env.OSM_FIXTURE_PATH,
  });
  const enriched = await runGoogleEnrich({
    citySlug: config.city_slug,
    skipGoogle: !process.env.GOOGLE_PLACES_API_KEY && !process.env.GOOGLE_FIXTURE_PATH,
    fixturePath: process.env.GOOGLE_FIXTURE_PATH,
  });

  const candidates = [...osm.candidates, ...enriched.candidates, ...fromContentDirectory(config), ...fromManualCandidates(config)];
  const deduped = new Map<string, CandidateVenueRaw>();

  for (const candidate of candidates) {
    const key = normalizeKey(candidate);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, candidate);
      continue;
    }

    deduped.set(key, {
      ...existing,
      source_urls: Array.from(new Set([...existing.source_urls, ...candidate.source_urls])),
      snippets: [...existing.snippets, ...candidate.snippets].slice(0, 8),
      candidate_categories: Array.from(new Set([...existing.candidate_categories, ...candidate.candidate_categories])),
      enrichment_sources: Array.from(new Set([...(existing.enrichment_sources ?? []), ...(candidate.enrichment_sources ?? [])])),
      review_sources: Array.from(new Set([...(existing.review_sources ?? []), ...(candidate.review_sources ?? [])])),
      source_provenance: [...existing.source_provenance, ...candidate.source_provenance],
      website: existing.website ?? candidate.website,
      address: existing.address ?? candidate.address,
    });
  }

  return Array.from(deduped.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, config.max_candidates ?? 500);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [configPath] = process.argv.slice(2);
  if (!configPath) throw new Error("Usage: node scripts/agents/runDiscovery.ts <city-config.json>");

  const config = readJson<CityDiscoveryConfig>(path.resolve(configPath));
  runDiscovery(config)
    .then((discoveryCandidates) => {
      const outputDir = path.resolve("data/raw/discovery");
      fs.mkdirSync(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, `${config.city_slug}.json`);
      fs.writeFileSync(outputPath, `${JSON.stringify(discoveryCandidates, null, 2)}\n`, "utf8");
      process.stdout.write(`Discovered ${discoveryCandidates.length} candidates for ${config.city}.\n`);
      process.stdout.write(`Wrote: ${outputPath}\n`);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exit(1);
    });
}
