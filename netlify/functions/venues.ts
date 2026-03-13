import fs from "node:fs";
import path from "node:path";
import type { Handler } from "@netlify/functions";
import type { CanonicalVenue } from "../../lib/schema/models.ts";

const loadVenues = (): CanonicalVenue[] => {
  const root = process.cwd();
  const dir = path.join(root, "data/processed/venues");
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".canonical.json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as CanonicalVenue);
};

const toApiVenue = (venue: CanonicalVenue) => ({
  id: venue.id,
  slug: venue.slug,
  name: venue.name,
  city: venue.city,
  country: venue.country,
  category: venue.category,
  bathing_style: venue.bathing_style,
  features: venue.features,
});

export const handler: Handler = async (event) => {
  try {
    const venues = loadVenues();
    const requestPath = event.path.replace(/^\/\.netlify\/functions\/venues/, "") || "/venues";

    if (requestPath === "/venues" || requestPath === "/") {
      return { statusCode: 200, body: JSON.stringify({ venues: venues.map(toApiVenue) }) };
    }

    if (requestPath === "/venues/search") {
      const q = (event.queryStringParameters?.q ?? "").toLowerCase();
      const matches = venues.filter((venue) => [venue.name, ...venue.features, venue.category, venue.bathing_style]
        .join(" ")
        .toLowerCase()
        .includes(q));
      return { statusCode: 200, body: JSON.stringify({ venues: matches.map(toApiVenue) }) };
    }

    const idMatch = requestPath.match(/^\/venues\/([^/]+)$/);
    if (idMatch) {
      const found = venues.find((venue) => venue.id === idMatch[1] || venue.slug === idMatch[1]);
      if (!found) return { statusCode: 404, body: JSON.stringify({ error: "VENUE_NOT_FOUND" }) };
      return { statusCode: 200, body: JSON.stringify({ venue: toApiVenue(found) }) };
    }

    return { statusCode: 404, body: JSON.stringify({ error: "NOT_FOUND" }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: "VENUES_API_FAILED", detail: error instanceof Error ? error.message : String(error) }) };
  }
};
