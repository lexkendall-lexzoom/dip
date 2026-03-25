import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const KEY_CITIES = ["new-york-city", "miami", "chicago", "san-francisco", "los-angeles"];
const DEFAULT_DESCRIPTION = "Draft venue profile. Needs editorial review.";
const REQUEST_TIMEOUT_MS = 12000;
const REQUEST_DELAY_MS = 500;

type VenueFile = {
  seo?: {
    title?: string;
    description?: string;
    social_image?: string;
  };
  venue?: {
    name?: string;
    slug?: string;
    status?: string;
    city?: string;
    country?: string;
    short_description?: string;
    long_description?: string;
    address?: string;
    website_url?: string;
    booking_url?: string;
    instagram_url?: string;
    primary_archetype?: string;
    hero_image?: string;
    gallery_images?: string[];
    source_urls?: string[];
    amenities?: string[];
    rituals?: string[];
  };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeMaybeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const uniqueStrings = (values: Array<string | undefined>): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = sanitizeMaybeString(value);
    if (!cleaned) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
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
    if (content) return decodeHtml(content);
  }
  return undefined;
};

const extractLinksByPattern = (html: string, pattern: RegExp, baseUrl: string): string[] => {
  const found = html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi);
  const links: string[] = [];
  for (const match of found) {
    const href = sanitizeMaybeString(match[1]);
    if (!href || !pattern.test(href)) continue;
    const full = absoluteUrl(baseUrl, href);
    if (full) links.push(full);
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
    const full = absoluteUrl(baseUrl, src);
    if (full) images.push(full);
    if (images.length >= 12) break;
  }
  return uniqueStrings(images);
};

const fetchWebsite = async (url: string): Promise<string | undefined> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; DipDaysVenueBackfill/1.0; +https://www.dipdays.com)",
        accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.toLowerCase().includes("text/html")) return undefined;
    return await response.text();
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
};

const inferPrimaryArchetype = (venue: VenueFile["venue"]): string => {
  const haystack = [
    venue?.name,
    venue?.short_description,
    venue?.long_description,
    ...(venue?.amenities ?? []),
    ...(venue?.rituals ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\bhammam\b/.test(haystack)) return "Hammam";
  if (/\bbath\s?house\b|\bbanya\b|\bthermal baths?\b/.test(haystack)) return "Bathhouse";
  if (/\bcold plunge\b|\bcontrast\b/.test(haystack)) return "Contrast Therapy";
  if (/\bsauna\b/.test(haystack)) return "Sauna";
  if (/\bspa\b/.test(haystack)) return "Spa";
  return "Other";
};

const updateVenueFile = async (filePath: string): Promise<"updated" | "skipped" | "error"> => {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = yaml.load(raw) as VenueFile;
    if (!parsed?.venue) return "skipped";

    const website = sanitizeMaybeString(parsed.venue.website_url);
    if (!website) return "skipped";

    const html = await fetchWebsite(website);
    if (!html) return "skipped";

    const description = matchMetaContent(html, ["description", "og:description", "twitter:description"]);
    const hero = absoluteUrl(website, matchMetaContent(html, ["og:image", "twitter:image", "twitter:image:src"]));
    const instagram = extractLinksByPattern(html, /instagram\.com/i, website)[0];
    const booking = extractLinksByPattern(html, /(book|booking|reserve|resy|mindbody|tock|opentable|fresha)/i, website)[0];
    const images = extractImageUrls(html, website);

    let changed = false;

    parsed.seo = parsed.seo ?? {};
    parsed.venue = parsed.venue ?? {};

    const currentShort = sanitizeMaybeString(parsed.venue.short_description);
    if ((!currentShort || currentShort === DEFAULT_DESCRIPTION) && description) {
      parsed.venue.short_description = description;
      changed = true;
    }

    const currentSeoDesc = sanitizeMaybeString(parsed.seo.description);
    if ((!currentSeoDesc || currentSeoDesc === DEFAULT_DESCRIPTION) && sanitizeMaybeString(parsed.venue.short_description)) {
      parsed.seo.description = parsed.venue.short_description;
      changed = true;
    }

    if (!sanitizeMaybeString(parsed.venue.instagram_url) && instagram) {
      parsed.venue.instagram_url = instagram;
      changed = true;
    }

    if (!sanitizeMaybeString(parsed.venue.booking_url) && booking) {
      parsed.venue.booking_url = booking;
      changed = true;
    }

    if (!sanitizeMaybeString(parsed.venue.hero_image) && hero) {
      parsed.venue.hero_image = hero;
      changed = true;
    }

    const gallery = parsed.venue.gallery_images ?? [];
    if (gallery.length === 0 && images.length > 0) {
      parsed.venue.gallery_images = uniqueStrings(images.slice(0, 8));
      changed = true;
    }

    const sourceUrls = uniqueStrings([
      ...(parsed.venue.source_urls ?? []),
      website,
      instagram,
      booking,
      hero,
      ...(parsed.venue.gallery_images ?? []),
    ]);
    if (sourceUrls.join("|") !== (parsed.venue.source_urls ?? []).join("|")) {
      parsed.venue.source_urls = sourceUrls;
      changed = true;
    }

    if (!sanitizeMaybeString(parsed.seo.social_image) && sanitizeMaybeString(parsed.venue.hero_image)) {
      parsed.seo.social_image = parsed.venue.hero_image;
      changed = true;
    }

    if (!sanitizeMaybeString(parsed.venue.primary_archetype) || parsed.venue.primary_archetype === "Other") {
      const inferred = inferPrimaryArchetype(parsed.venue);
      if (inferred !== parsed.venue.primary_archetype) {
        parsed.venue.primary_archetype = inferred;
        changed = true;
      }
    }

    if (!changed) return "skipped";

    const output = yaml.dump(parsed, { noRefs: true, lineWidth: 120, sortKeys: false });
    fs.writeFileSync(filePath, output, "utf8");
    return "updated";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[backfill:error] ${filePath}: ${message}\n`);
    return "error";
  }
};

const run = async (): Promise<void> => {
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const city of KEY_CITIES) {
    const dir = path.resolve("content/venues", city);
    if (!fs.existsSync(dir)) continue;

    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".yml"))
      .map((name) => path.join(dir, name));

    process.stdout.write(`[backfill] ${city}: ${files.length} files\n`);

    for (const filePath of files) {
      const result = await updateVenueFile(filePath);
      if (result === "updated") {
        updated += 1;
        process.stdout.write(`[updated] ${path.relative(process.cwd(), filePath)}\n`);
      } else if (result === "skipped") {
        skipped += 1;
      } else {
        failed += 1;
      }
      await sleep(REQUEST_DELAY_MS);
    }
  }

  process.stdout.write("\nBackfill summary\n");
  process.stdout.write(`- updated: ${updated}\n`);
  process.stdout.write(`- skipped: ${skipped}\n`);
  process.stdout.write(`- failed: ${failed}\n`);

  if (failed > 0) process.exitCode = 1;
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
