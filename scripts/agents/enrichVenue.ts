import type { VenueCandidate } from "./discoverVenues.ts";
import { uniqueStrings } from "./helpers.ts";

export type EnrichedVenue = {
  name: string;
  city: string;
  region?: string;
  country?: string;
  neighborhood?: string;
  address?: string;
  website_url?: string;
  booking_url?: string;
  instagram_url?: string;
  short_description?: string;
  long_description?: string;
  amenities?: string[];
  rituals?: string[];
  hours?: string;
  hero_image?: string;
  gallery?: string[];
  source_urls?: string[];
  slug?: string;
};

const sanitizeMaybeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const decodeHtml = (value: string): string =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

const absoluteUrl = (baseUrl: string, maybeUrl: string | undefined): string | undefined => {
  if (!maybeUrl) return undefined;
  try {
    return new URL(maybeUrl, baseUrl).toString();
  } catch {
    return undefined;
  }
};

const matchMetaContent = (html: string, names: string[]): string | undefined => {
  for (const name of names) {
    const expression = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    );
    const reverseExpression = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["'][^>]*>`,
      "i",
    );
    const match = html.match(expression) ?? html.match(reverseExpression);
    const content = sanitizeMaybeString(match?.[1]);
    if (content) {
      return decodeHtml(content);
    }
  }
  return undefined;
};

const extractLinksByPattern = (html: string, pattern: RegExp, baseUrl: string): string[] => {
  const found = html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi);
  const links: string[] = [];
  for (const match of found) {
    const href = sanitizeMaybeString(match[1]);
    if (!href) continue;
    if (!pattern.test(href)) continue;
    const parsed = absoluteUrl(baseUrl, href);
    if (parsed) links.push(parsed);
  }
  return uniqueStrings(links);
};

const extractImageUrls = (html: string, baseUrl: string): string[] => {
  const matches = html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
  const images: string[] = [];
  for (const match of matches) {
    const src = sanitizeMaybeString(match[1]);
    const lower = src?.toLowerCase() ?? "";
    if (!src || lower.startsWith("data:")) continue;
    const parsed = absoluteUrl(baseUrl, src);
    if (parsed) images.push(parsed);
    if (images.length >= 12) break;
  }
  return uniqueStrings(images);
};

const fetchWebsite = async (url: string): Promise<string | undefined> => {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; DipDaysEnricher/1.0; +https://www.dipdays.com)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
      return undefined;
    }

    return await response.text();
  } catch {
    return undefined;
  }
};

export async function enrichVenue(candidate: VenueCandidate): Promise<EnrichedVenue> {
  const website = sanitizeMaybeString(candidate.website_url);
  const sourceUrls = uniqueStrings([...(candidate.source_urls ?? []), website]);

  let shortDescription: string | undefined;
  let instagramUrl: string | undefined;
  let bookingUrl: string | undefined;
  let heroImage: string | undefined;
  let gallery: string[] = [];

  if (website) {
    const html = await fetchWebsite(website);
    if (html) {
      shortDescription = matchMetaContent(html, ["description", "og:description", "twitter:description"]);
      heroImage = absoluteUrl(
        website,
        matchMetaContent(html, ["og:image", "twitter:image", "twitter:image:src"]),
      );

      const instagramLinks = extractLinksByPattern(html, /instagram\.com/i, website);
      const bookingLinks = extractLinksByPattern(
        html,
        /(book|booking|reserve|resy|mindbody|tock|opentable|fresha)/i,
        website,
      );
      gallery = extractImageUrls(html, website);

      instagramUrl = instagramLinks[0];
      bookingUrl = bookingLinks[0];
      sourceUrls.push(...instagramLinks, ...bookingLinks, ...(heroImage ? [heroImage] : []));
    }
  }

  return {
    name: candidate.name.trim(),
    city: candidate.city.trim(),
    region: sanitizeMaybeString(candidate.region),
    country: sanitizeMaybeString(candidate.country),
    address: sanitizeMaybeString(candidate.address),
    website_url: website,
    short_description: shortDescription,
    booking_url: bookingUrl,
    instagram_url: instagramUrl,
    hero_image: heroImage,
    gallery,
    source_urls: uniqueStrings(sourceUrls),
  };
}
