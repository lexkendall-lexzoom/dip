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
  async discover() {
    // Intentionally disabled by default. A future provider can be added safely
    // without changing the fixture-first behavior.
    return [];
  },
};

export async function discoverVenues(citySlug: string): Promise<VenueCandidate[]> {
  if (!citySlug.trim()) {
    throw new Error("discoverVenues requires a city slug.");
  }

  const useLiveProvider = process.env.DIPDAYS_DISCOVERY_PROVIDER === "live";
  if (useLiveProvider) {
    const liveResults = await liveProvider.discover(citySlug);
    if (liveResults.length > 0) {
      return liveResults;
    }
    process.stdout.write(`[discover] live provider returned no candidates for ${citySlug}; falling back to fixtures.\n`);
  }

  return fixtureProvider.discover(citySlug);
}
