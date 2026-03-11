import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import type { CandidateVenueRaw } from "../../lib/schema/models.ts";

type SeedSource = {
  source_label: string;
  source_url: string;
};

type ManualCandidate = {
  name: string;
  website?: string;
  address?: string;
  snippets?: string[];
  source_urls?: string[];
};

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
  slug?: string;
  website?: string;
  address?: string;
  categories?: string[];
  description?: string;
};

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
  if (/bathhouse|thermal|hot springs/.test(haystack)) categories.add("Bathhouse");
  if (/cold plunge|contrast|ice bath/.test(haystack)) categories.add("Contrast Therapy");

  return Array.from(categories);
};

const fromContentDirectory = (config: CityDiscoveryConfig): CandidateVenueRaw[] => {
  const citySlug = config.content_city_slug ?? config.city_slug;
  const directory = path.resolve("content/venues", citySlug);

  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .map((file) => {
      const sourceFilePath = path.join(directory, file);
      const raw = yaml.load(fs.readFileSync(sourceFilePath, "utf8")) as VenueContentRecord;
      const snippetText = raw.description ?? `${raw.name ?? "Venue"} in ${config.city}`;
      const website = raw.website;
      const localSourceUrl = `file://${sourceFilePath}`;
      const categoryText = [raw.name, raw.description, ...(raw.categories ?? [])].filter(Boolean).join(" ");

      return {
        name: raw.name ?? file.replace(/\.ya?ml$/i, ""),
        website,
        address: raw.address,
        city: config.city,
        country: config.country,
        source_urls: [localSourceUrl, ...(website ? [website] : [])],
        snippets: [
          {
            source_url: localSourceUrl,
            text: snippetText,
          },
        ],
        candidate_categories: raw.categories?.length ? raw.categories : inferCandidateCategories(categoryText),
        source_provenance: [
          {
            source_type: "directory_seed",
            source_url: localSourceUrl,
            source_label: "Existing DipDays venue directory",
            discovered_at: nowIso(),
          },
        ],
      } as CandidateVenueRaw;
    });
};

const fromManualCandidates = (config: CityDiscoveryConfig): CandidateVenueRaw[] => {
  return (config.manual_candidates ?? []).map((candidate) => {
    const seedSource = config.seed_sources?.[0];
    const sourceUrl = candidate.source_urls?.[0] ?? seedSource?.source_url ?? "https://example.com";

    return {
      name: candidate.name,
      website: candidate.website,
      address: candidate.address,
      city: config.city,
      country: config.country,
      source_urls: Array.from(new Set([...(candidate.source_urls ?? []), ...(candidate.website ? [candidate.website] : []), sourceUrl])),
      snippets: (candidate.snippets ?? [`Discovered candidate venue in ${config.city}.`]).map((text) => ({
        source_url: sourceUrl,
        text,
      })),
      candidate_categories: inferCandidateCategories([candidate.name, ...(candidate.snippets ?? [])].join(" ")),
      source_provenance: [
        {
          source_type: "manual",
          source_url: sourceUrl,
          source_label: seedSource?.source_label ?? "Manual city seed",
          discovered_at: nowIso(),
        },
      ],
    };
  });
};

export function runDiscovery(config: CityDiscoveryConfig): CandidateVenueRaw[] {
  const candidates = [...fromContentDirectory(config), ...fromManualCandidates(config)];
  const deduped = new Map<string, CandidateVenueRaw>();

  candidates.forEach((candidate) => {
    const key = normalizeKey(candidate);
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, candidate);
      return;
    }

    deduped.set(key, {
      ...existing,
      source_urls: Array.from(new Set([...existing.source_urls, ...candidate.source_urls])),
      snippets: [...existing.snippets, ...candidate.snippets].slice(0, 6),
      candidate_categories: Array.from(new Set([...existing.candidate_categories, ...candidate.candidate_categories])),
      source_provenance: [...existing.source_provenance, ...candidate.source_provenance],
    });
  });

  const maxCandidates = config.max_candidates ?? 500;
  return Array.from(deduped.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, maxCandidates);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const [configPath] = process.argv.slice(2);

  if (!configPath) {
    throw new Error("Usage: node scripts/agents/runDiscovery.ts <city-config.json>");
  }

  const config = JSON.parse(fs.readFileSync(path.resolve(configPath), "utf8")) as CityDiscoveryConfig;
  const discovered = runDiscovery(config);
  const outputPath = path.resolve("data/raw/discovery", `${config.city_slug}.json`);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(discovered, null, 2)}\n`, "utf8");

  process.stdout.write(`Discovered ${discovered.length} candidates for ${config.city}.\n`);
  process.stdout.write(`Wrote ${outputPath}\n`);
}
