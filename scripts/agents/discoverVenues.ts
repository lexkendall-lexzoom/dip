import fs from "fs";
import path from "path";
import { cityNameFromSlug, uniqueStrings } from "./helpers.ts";

export type VenueCandidate = {
  name: string;
  city: string;
  region?: string;
  country: string;
  website_url?: string;
  address?: string;
  source_urls?: string[];
};

type DiscoveryProvider = {
  discover: (citySlug: string) => Promise<VenueCandidate[]>;
};

const CITY_CONFIG: Record<
  string,
  {
    name: string;
    region: string;
    country: string;
  }
> = {
  "new-york-city": {
    name: "New York City",
    region: "New York",
    country: "United States",
  },
  chicago: {
    name: "Chicago",
    region: "Illinois",
    country: "United States",
  },
  "san-francisco": {
    name: "San Francisco",
    region: "California",
    country: "United States",
  },
  "los-angeles": {
    name: "Los Angeles",
    region: "California",
    country: "United States",
  },
  miami: {
    name: "Miami",
    region: "Florida",
    country: "United States",
  },
};

const DISCOVERY_QUERIES = [
  "sauna",
  "bathhouse",
  "spa",
  "cold plunge",
  "hammam",
  "wellness spa",
  "thermal baths",
  "contrast therapy",
];

const DISCOVERY_SOURCES = ["site:yelp.com", "site:google.com/maps", "site:spafinder.com"];
const REQUEST_DELAY_MS = 700;
const REQUEST_TIMEOUT_MS = 12000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeText = (value: string): string =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const extractDomain = (input: string): string => {
  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return "";
  }
};

const parseNameFromTitle = (title: string): string | undefined => {
  const clean = sanitizeText(title);
  if (!clean) return undefined;
  const segments = clean
    .split(/\s+[\-|–|•]\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return undefined;
  const candidate = segments[0];
  if (candidate.length < 3) return undefined;
  if (/^(yelp|google maps|spafinder|tripadvisor)$/i.test(candidate)) return undefined;
  return candidate;
};

const parseAddress = (snippet: string, cityName: string): string | undefined => {
  const clean = sanitizeText(snippet);
  if (!clean) return undefined;
  const parts = clean.split(/\s+[\-|•]\s+/).map((part) => part.trim());
  const match = parts.find((part) => /\d/.test(part) && part.toLowerCase().includes(cityName.toLowerCase().split(" ")[0]));
  return match;
};

const fetchText = async (url: string): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; DipDaysVenueDiscovery/1.0; +https://www.dipdays.com)",
        accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
};

const parseDuckDuckGoResults = (
  html: string,
  cityConfig: { name: string; region: string; country: string },
): VenueCandidate[] => {
  const matches = html.matchAll(
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g,
  );

  const parsed: VenueCandidate[] = [];
  for (const match of matches) {
    const rawUrl = sanitizeText(match[1] ?? "");
    const url = rawUrl.startsWith("http") ? rawUrl : undefined;
    if (!url) continue;

    const domain = extractDomain(url);
    if (!["www.yelp.com", "yelp.com", "www.google.com", "google.com", "www.spafinder.com", "spafinder.com"].includes(domain)) {
      continue;
    }

    const name = parseNameFromTitle(match[2] ?? "");
    if (!name) continue;
    const address = parseAddress(match[3] ?? "", cityConfig.name);

    parsed.push({
      name,
      city: cityConfig.name,
      region: cityConfig.region,
      country: cityConfig.country,
      website_url: undefined,
      address,
      source_urls: [url],
    });
  }

  return parsed;
};

const dedupeCandidates = (candidates: VenueCandidate[]): VenueCandidate[] => {
  const byKey = new Map<string, VenueCandidate>();
  for (const candidate of candidates) {
    const normalizedName = candidate.name.trim().toLowerCase();
    const normalizedAddress = candidate.address?.trim().toLowerCase() || "";
    const key = `${normalizedName}::${normalizedAddress}`;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...candidate,
        source_urls: uniqueStrings(candidate.source_urls ?? []),
      });
      continue;
    }

    byKey.set(key, {
      ...existing,
      website_url: existing.website_url || candidate.website_url,
      address: existing.address || candidate.address,
      source_urls: uniqueStrings([...(existing.source_urls ?? []), ...(candidate.source_urls ?? [])]),
    });
  }

  return [...byKey.values()];
};

const fixturePathForCity = (citySlug: string): string => path.resolve("scripts/agents/fixtures", `${citySlug}.json`);

const fixtureProvider: DiscoveryProvider = {
  async discover(citySlug) {
    const fixturePath = fixturePathForCity(citySlug);
    if (!fs.existsSync(fixturePath)) {
      return [];
    }

    const parsed = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as VenueCandidate[];

    return parsed
      .filter((item) => item && typeof item.name === "string" && item.name.trim())
      .map((item) => ({
        ...item,
        city: item.city?.trim() || cityNameFromSlug(citySlug),
        country: item.country?.trim() || "",
        source_urls: uniqueStrings([...(item.source_urls ?? []), item.website_url]),
      }))
      .filter((item) => Boolean(item.country));
  },
};

const liveProvider: DiscoveryProvider = {
  async discover(citySlug) {
    const cityConfig = CITY_CONFIG[citySlug];
    if (!cityConfig) {
      process.stdout.write(`[discover] no live city config for ${citySlug}; falling back to fixtures.\n`);
      return [];
    }

    const discovered: VenueCandidate[] = [];

    for (const query of DISCOVERY_QUERIES) {
      for (const source of DISCOVERY_SOURCES) {
        const fullQuery = `${query} ${cityConfig.name} ${source}`;
        const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(fullQuery)}`;

        try {
          const html = await fetchText(searchUrl);
          const parsed = parseDuckDuckGoResults(html, cityConfig);
          discovered.push(...parsed);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          process.stderr.write(`[discover:warn] ${citySlug} query \"${fullQuery}\" failed: ${message}\n`);
        }

        await sleep(REQUEST_DELAY_MS);
      }
    }

    return dedupeCandidates(discovered);
  },
};

export async function discoverVenues(citySlug: string): Promise<VenueCandidate[]> {
  if (!citySlug.trim()) {
    throw new Error("discoverVenues requires a city slug.");
  }

  const providerMode = process.env.DIPDAYS_DISCOVERY_PROVIDER?.trim().toLowerCase() || "auto";
  const shouldTryLive = providerMode !== "fixture" && Boolean(CITY_CONFIG[citySlug]);

  if (shouldTryLive) {
    const liveResults = await liveProvider.discover(citySlug);
    if (liveResults.length > 0) {
      return liveResults;
    }
    process.stdout.write(`[discover] live provider returned no candidates for ${citySlug}; falling back to fixtures.\n`);
  }

  return fixtureProvider.discover(citySlug);
}
