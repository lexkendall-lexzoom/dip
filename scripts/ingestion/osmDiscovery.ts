import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CandidateVenueRaw } from "../../lib/schema/models.ts";

type CityConfig = {
  city: string;
  city_slug: string;
  country: string;
  max_candidates?: number;
  bbox?: [number, number, number, number];
  bboxes?: Array<[number, number, number, number]>;
};

type OSMElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = { elements: OSMElement[] };

type OSMDiscoveryCandidate = CandidateVenueRaw & {
  osm_id: string;
  lat?: number;
  lng?: number;
};

type RunOptions = {
  citySlug: string;
  tileOverride?: [number, number, number, number];
  bboxOverride?: [number, number, number, number];
  dry?: boolean;
  resume?: boolean;
  fixturePath?: string;
  tileSizeDeg?: number;
};

const DEFAULT_ENDPOINT = process.env.OVERPASS_ENDPOINT ?? "https://overpass-api.de/api/interpreter";
const DEFAULT_TIMEOUT_MS = Number(process.env.OVERPASS_TIMEOUT_MS ?? 25000);
const DEFAULT_RETRIES = Number(process.env.OVERPASS_RETRY_COUNT ?? 3);
const TILE_SIZE = 0.08;
const TAG_FILTERS = [
  ["leisure", "sauna"],
  ["amenity", "spa"],
  ["natural", "hot_spring"],
  ["amenity", "public_bath"],
  ["amenity", "baths"],
] as const;

const readJson = <T>(p: string): T => JSON.parse(fs.readFileSync(p, "utf8")) as T;

const cityConfigPath = (citySlug: string): string => path.resolve("configs/cities", `${citySlug}.json`);
const rawDir = (citySlug: string): string => path.resolve("data/raw/osm", citySlug);
const checkpointPath = (citySlug: string): string => path.join(rawDir(citySlug), "checkpoint.json");
const processedPath = (citySlug: string): string => path.resolve("data/processed/discovery", `${citySlug}.json`);

const parseBBox = (value: string): [number, number, number, number] => {
  const parts = value.split(",").map((v) => Number(v.trim()));
  if (parts.length !== 4 || parts.some((v) => Number.isNaN(v))) {
    throw new Error(`Invalid bbox/tile format: '${value}'. Use south,west,north,east`);
  }
  return [parts[0], parts[1], parts[2], parts[3]];
};

const toTileId = (bbox: [number, number, number, number]): string =>
  `${bbox[0].toFixed(4)}_${bbox[1].toFixed(4)}_${bbox[2].toFixed(4)}_${bbox[3].toFixed(4)}`;

const tilesForBBox = (bbox: [number, number, number, number], tileSize = TILE_SIZE): Array<[number, number, number, number]> => {
  const [south, west, north, east] = bbox;
  const tiles: Array<[number, number, number, number]> = [];

  for (let lat = south; lat < north; lat += tileSize) {
    for (let lon = west; lon < east; lon += tileSize) {
      tiles.push([
        Number(lat.toFixed(6)),
        Number(lon.toFixed(6)),
        Number(Math.min(north, lat + tileSize).toFixed(6)),
        Number(Math.min(east, lon + tileSize).toFixed(6)),
      ]);
    }
  }

  return tiles;
};

const buildOverpassQuery = (bbox: [number, number, number, number]): string => {
  const [s, w, n, e] = bbox;
  const clauses = TAG_FILTERS.map(([k, v]) => {
    const box = `(${s},${w},${n},${e})`;
    return `node["${k}"="${v}"]${box};way["${k}"="${v}"]${box};relation["${k}"="${v}"]${box};`;
  }).join("\n");

  return `[out:json][timeout:25];(\n${clauses}\n);out center tags;`;
};

async function fetchWithRetries(url: string, init: RequestInit, retries: number): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < retries; i += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const osmTypePrefix = (type: OSMElement["type"]): string => `osm-${type}-`;

const inferCategories = (tags: Record<string, string>): string[] => {
  const c = new Set<string>();
  if (tags.leisure === "sauna") c.add("Sauna");
  if (tags.amenity === "spa") c.add("Spa");
  if (tags.amenity === "public_bath" || tags.amenity === "baths") c.add("Bathhouse");
  if (tags.natural === "hot_spring") c.add("Hot Spring");
  return [...c];
};

const toCandidate = (el: OSMElement, config: CityConfig): OSMDiscoveryCandidate | null => {
  const tags = el.tags ?? {};
  if (!tags.name) return null;

  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  const osmId = `${osmTypePrefix(el.type)}${el.id}`;
  const osmUrl = `https://www.openstreetmap.org/${el.type}/${el.id}`;

  return {
    osm_id: osmId,
    name: tags.name,
    website: tags.website ?? tags["contact:website"],
    address: tags["addr:full"] ?? ([tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ") || undefined),
    city: tags["addr:city"] ?? config.city,
    country: tags["addr:country"] ?? config.country,
    lat,
    lng,
    source_urls: [osmUrl],
    snippets: [{ source_url: osmUrl, text: tags.description ?? `${tags.name} discovered from OSM.` }],
    candidate_categories: inferCategories(tags),
    source_provenance: [{
      source_type: "aggregator",
      source_url: osmUrl,
      source_label: "OpenStreetMap/Overpass",
      discovered_at: new Date().toISOString(),
    }],
  };
};

export async function runOsmDiscovery(options: RunOptions): Promise<{ candidates: OSMDiscoveryCandidate[]; outputPath: string }> {
  const config = readJson<CityConfig>(cityConfigPath(options.citySlug));
  const allBboxes = options.tileOverride
    ? [options.tileOverride]
    : options.bboxOverride
      ? tilesForBBox(options.bboxOverride, options.tileSizeDeg ?? TILE_SIZE)
      : (config.bboxes ?? (config.bbox ? [config.bbox] : [])).flatMap((b) => tilesForBBox(b, options.tileSizeDeg ?? TILE_SIZE));

  if (allBboxes.length === 0) {
    throw new Error(`No bbox found for ${options.citySlug}. Add bbox/bboxes to config or pass --bbox/--tile.`);
  }

  const outRawDir = rawDir(options.citySlug);
  const outProcessed = processedPath(options.citySlug);
  const fetchedCheckpoint = options.resume && fs.existsSync(checkpointPath(options.citySlug))
    ? new Set(readJson<string[]>(checkpointPath(options.citySlug)))
    : new Set<string>();

  const elements: OSMElement[] = [];
  fs.mkdirSync(outRawDir, { recursive: true });

  for (const bbox of allBboxes) {
    const tileId = toTileId(bbox);
    if (options.resume && fetchedCheckpoint.has(tileId)) {
      continue;
    }

    let payload: OverpassResponse;
    if (options.fixturePath) {
      payload = readJson<OverpassResponse>(path.resolve(options.fixturePath));
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
      const query = buildOverpassQuery(bbox);
      const response = await fetchWithRetries(DEFAULT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      }, DEFAULT_RETRIES);
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`Overpass request failed for tile ${tileId}: ${response.status}`);
      }
      payload = await response.json() as OverpassResponse;
    }

    elements.push(...(payload.elements ?? []));

    if (!options.dry) {
      fs.writeFileSync(path.join(outRawDir, `${tileId}.json`), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      fetchedCheckpoint.add(tileId);
      fs.writeFileSync(checkpointPath(options.citySlug), `${JSON.stringify([...fetchedCheckpoint], null, 2)}\n`, "utf8");
    }
  }

  const deduped = new Map<string, OSMDiscoveryCandidate>();
  for (const el of elements) {
    const candidate = toCandidate(el, config);
    if (!candidate) continue;
    if (!deduped.has(candidate.osm_id)) {
      deduped.set(candidate.osm_id, candidate);
    }
  }

  const candidates = [...deduped.values()].sort((a, b) => a.name.localeCompare(b.name));

  if (!options.dry) {
    fs.mkdirSync(path.dirname(outProcessed), { recursive: true });
    fs.writeFileSync(outProcessed, `${JSON.stringify(candidates.slice(0, config.max_candidates ?? 1000), null, 2)}\n`, "utf8");
  }

  return { candidates: candidates.slice(0, config.max_candidates ?? 1000), outputPath: outProcessed };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  const citySlug = args.find((arg) => !arg.startsWith("--"));
  if (!citySlug) throw new Error("Usage: node scripts/ingestion/osmDiscovery.ts <city-slug> [--bbox=s,w,n,e] [--tile=s,w,n,e] [--resume] [--dry] [--fixture=path]");
  const tileArg = args.find((arg) => arg.startsWith("--tile="));
  const bboxArg = args.find((arg) => arg.startsWith("--bbox="));
  const fixtureArg = args.find((arg) => arg.startsWith("--fixture="));
  runOsmDiscovery({
    citySlug,
    tileOverride: tileArg ? parseBBox(tileArg.split("=")[1]) : undefined,
    bboxOverride: bboxArg ? parseBBox(bboxArg.split("=")[1]) : undefined,
    resume: args.includes("--resume"),
    dry: args.includes("--dry"),
    fixturePath: fixtureArg ? fixtureArg.split("=")[1] : undefined,
  }).then(({ candidates, outputPath }) => {
    process.stdout.write(`OSM candidates: ${candidates.length}\n`);
    process.stdout.write(`Discovery output: ${outputPath}\n`);
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
