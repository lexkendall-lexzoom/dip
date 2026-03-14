import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadSearchData } from "../../lib/search/loadSearchData.ts";
import { searchVenues } from "../../lib/search/searchVenues.ts";
import { handler as searchHandler } from "../../netlify/functions/search.ts";
import { handler as venuesHandler } from "../../netlify/functions/venues.ts";

type VerificationSuite = "search" | "api" | "data";

const suiteArg = process.argv[2];
if (suiteArg !== "search" && suiteArg !== "api" && suiteArg !== "data") {
  console.error("Usage: tsx scripts/tests/verifyDipDays.ts <search|api|data>");
  process.exit(1);
}

const suite: VerificationSuite = suiteArg;
const suiteLabel = `[test:${suite}]`;

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const verifyDatasetLoads = () => {
  const { venues, scores, diagnostics } = loadSearchData();
  assert(venues.length > 0, "Expected canonical venues to load.");
  assert(scores.size > 0, "Expected score records to load.");
  console.log(`${suiteLabel} dataset loads: ${venues.length} venues, ${scores.size} scores from ${diagnostics.resolvedRoot}`);
};


const verifySearchDataDegradesWithoutScores = () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dip-search-fixture-"));
  const fixtureVenueDir = path.join(fixtureRoot, "data/processed/venues");
  fs.mkdirSync(fixtureVenueDir, { recursive: true });

  const sourceVenueDir = path.join(process.cwd(), "data/processed/venues");
  const [firstVenueFile] = fs.readdirSync(sourceVenueDir).filter((file) => file.endsWith(".canonical.json"));
  assert(typeof firstVenueFile === "string", "Expected at least one canonical venue fixture file.");
  fs.copyFileSync(path.join(sourceVenueDir, firstVenueFile), path.join(fixtureVenueDir, firstVenueFile));

  const originalCwd = process.cwd();
  try {
    process.chdir(fixtureRoot);
    const degradedData = loadSearchData();
    assert(degradedData.venues.length > 0, "Expected venues to load when scores/evidence are missing.");
    assert(degradedData.scores.size === 0, "Expected missing scores to degrade gracefully to empty map.");
    assert(Object.keys(degradedData.reviewEvidence).length === 0, "Expected missing evidence to degrade gracefully to empty map.");
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  console.log(`${suiteLabel} data degradation works: missing scores/evidence does not break search dataset load.`);
};

const verifyDataRootResolutionFromNestedCwd = () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dip-search-root-fixture-"));
  const fixtureVenueDir = path.join(fixtureRoot, "data/processed/venues");
  const nestedCwd = path.join(fixtureRoot, "tmp/workdir/deeper");
  fs.mkdirSync(fixtureVenueDir, { recursive: true });
  fs.mkdirSync(nestedCwd, { recursive: true });

  const sourceVenueDir = path.join(process.cwd(), "data/processed/venues");
  const [firstVenueFile] = fs.readdirSync(sourceVenueDir).filter((file) => file.endsWith(".canonical.json"));
  assert(typeof firstVenueFile === "string", "Expected at least one canonical venue fixture file.");
  fs.copyFileSync(path.join(sourceVenueDir, firstVenueFile), path.join(fixtureVenueDir, firstVenueFile));

  const originalCwd = process.cwd();
  try {
    process.chdir(nestedCwd);
    const data = loadSearchData();
    assert(data.venues.length > 0, "Expected venues to load from parent data root.");
    assert(data.diagnostics.resolvedRoot === fixtureRoot, `Expected resolved root ${fixtureRoot}, got ${data.diagnostics.resolvedRoot}.`);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  console.log(`${suiteLabel} data root resolution works from nested cwd.`);
};

const verifySearchResults = () => {
  const response = searchVenues("best sauna in new york", 5);
  assert(Array.isArray(response.results), "Search response results should be an array.");
  assert(response.results.length > 0, "Expected search to return at least one result.");
  console.log(`${suiteLabel} search results return: ${response.results.length} matches for \"${response.query}\"`);
};

const parseBody = (body: string | null | undefined) => {
  if (!body) return null;
  return JSON.parse(body) as Record<string, unknown>;
};

const verifyApiHandler = async () => {
  const searchEvent = { queryStringParameters: { q: "new york sauna" } };
  const searchResponse = await searchHandler(searchEvent);

  assert(searchResponse.statusCode === 200, `Expected search handler status 200, got ${searchResponse.statusCode}.`);
  const parsedSearch = parseBody(searchResponse.body);
  assert(parsedSearch && Array.isArray(parsedSearch.results), "Expected search handler body with results array.");
  assert((parsedSearch.results as unknown[]).length > 0, "Expected search handler to return at least one result.");

  const venuesResponse = await venuesHandler({
    path: "/.netlify/functions/venues/venues/search",
    queryStringParameters: { q: "sauna" },
  } as never, {} as never);

  assert(venuesResponse.statusCode === 200, `Expected venues handler status 200, got ${venuesResponse.statusCode}.`);
  const parsedVenues = parseBody(venuesResponse.body);
  assert(parsedVenues && Array.isArray(parsedVenues.venues), "Expected venues handler body with venues array.");
  assert((parsedVenues.venues as unknown[]).length > 0, "Expected venues handler search to return at least one venue.");

  console.log(`${suiteLabel} API handler works: search and venues handlers returned results.`);
};

const run = async () => {
  verifyDatasetLoads();
  verifySearchDataDegradesWithoutScores();
  verifyDataRootResolutionFromNestedCwd();
  verifySearchResults();
  await verifyApiHandler();
  console.log(`${suiteLabel} all checks passed.`);
};

run().catch((error) => {
  console.error(`${suiteLabel} verification failed`, error);
  process.exit(1);
});
