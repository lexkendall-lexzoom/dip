#!/usr/bin/env node
/**
 * scripts/enrich-nyc-venues.js
 *
 * Fetches Google Places review data for all NYC venues,
 * computes community_score + dip_index, extracts keywords via Claude,
 * and writes results back to the venue YAML files.
 *
 * Secrets (GOOGLE_PLACES_API_KEY + ANTHROPIC_API_KEY) are pulled from
 * Supabase Vault at startup — only SUPABASE_URL and SUPABASE_SERVICE_KEY
 * are needed as environment variables.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/enrich-nyc-venues.js
 *
 * Flags:
 *   --dry-run           Print what would be written without saving
 *   --venue=<slug>      Process a single venue (e.g. --venue=aire-ancient-baths)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const VENUES_DIR   = path.join(__dirname, '../content/venues/new-york-city');
const DRY_RUN      = process.argv.includes('--dry-run');
const SINGLE_VENUE = (process.argv.find(a => a.startsWith('--venue=')) || '').replace('--venue=', '');

// Populated from Vault before any venue processing begins
let GOOGLE_KEY    = '';
let ANTHROPIC_KEY = '';

// ── Vault ────────────────────────────────────────────────────────────────────

/**
 * Connect to Supabase and fetch GOOGLE_PLACES_API_KEY + ANTHROPIC_API_KEY
 * from the vault.decrypted_secrets view.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_KEY env vars.
 */
async function loadSecretsFromVault() {
  const supabaseUrl        = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl)        throw new Error('Missing env var: SUPABASE_URL');
  if (!supabaseServiceKey) throw new Error('Missing env var: SUPABASE_SERVICE_KEY');

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .schema('vault')
    .from('decrypted_secrets')
    .select('name, decrypted_secret')
    .in('name', ['Anthropic API key', 'google places api']);

  if (error) throw new Error(`Vault fetch failed: ${error.message}`);

  const raw = Object.fromEntries(
    (data || []).map(row => [row.name, row.decrypted_secret])
  );

  if (!raw['Anthropic API key'])  throw new Error('"Anthropic API key" not found in Vault');
  if (!raw['google places api'])  throw new Error('"google places api" not found in Vault');

  return {
    ANTHROPIC_API_KEY:    raw['Anthropic API key'],
    GOOGLE_PLACES_API_KEY: raw['google places api'],
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Use Google Find Place API to look up a venue's Place ID by name.
 * Returns null if no match is found.
 */
async function findPlaceId(name, city) {
  const query = encodeURIComponent(`${name} ${city}`);
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
    `?input=${query}&inputtype=textquery&fields=place_id,name&key=${GOOGLE_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Find Place API error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Find Place API status: ${data.status} — ${data.error_message || ''}`);
  }

  return (data.candidates && data.candidates.length > 0)
    ? data.candidates[0].place_id
    : null;
}

/**
 * Fetch rating, user_ratings_total, and review texts from Google Place Details.
 * Returns null if the place has no rating data.
 */
async function getPlaceDetails(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${placeId}&fields=rating,user_ratings_total,reviews&key=${GOOGLE_KEY}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Place Details API error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  if (data.status !== 'OK') {
    throw new Error(`Place Details API status: ${data.status} — ${data.error_message || ''}`);
  }

  const result = data.result;
  if (!result || result.rating == null) return null;

  return {
    rating:             result.rating,
    user_ratings_total: result.user_ratings_total || 0,
    reviews:            (result.reviews || []).map(r => r.text).filter(Boolean),
  };
}

// ── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Compute community_score (0–5) from Google rating + review count.
 * Uses a log-based confidence weight; thin coverage regresses toward baseline 4.0.
 */
function computeCommunityScore(rating, reviewCount) {
  if (rating == null || reviewCount == null) return null;
  const confidence = Math.min(1, Math.log10(Math.max(reviewCount, 1)) / 3);
  const score = (confidence * rating) + ((1 - confidence) * 4.0);
  return Math.round(score * 10) / 10;
}

/**
 * Blend dip_score (editorial, 0–10) and community_score (0–5 → normalised to 0–10)
 * into a single DIP Index.
 */
function computeDipIndex(dipScore, communityScore) {
  const ds = parseFloat(dipScore);
  if (isNaN(ds) || communityScore == null) return null;
  const normalised = communityScore * 2;            // 0–5 → 0–10
  const index = (0.6 * ds) + (0.4 * normalised);
  return Math.round(index * 10) / 10;
}

// ── Keyword extraction via Claude ────────────────────────────────────────────

/**
 * Send up to 15 review texts to Claude Haiku and get back
 * { positive: string[], negative: string[] } keyword clusters.
 */
async function extractKeywords(reviews) {
  if (!reviews || reviews.length === 0) return { positive: [], negative: [] };

  const reviewText = reviews.slice(0, 15).join('\n\n---\n\n');

  const prompt = `You are analyzing customer reviews for a spa/bathhouse venue.

Extract the key themes. Return ONLY valid JSON — no explanation, no markdown.

Reviews:
${reviewText}

Return exactly this shape:
{"positive":["theme1","theme2","theme3"],"negative":["theme1","theme2"]}

Rules:
- Maximum 3 positive themes, maximum 3 negative themes
- Each theme: 1–2 words, lowercase (e.g. "cleanliness", "hot pool", "service")
- Cluster similar phrases into one label
- Omit the "negative" key entirely if no negatives are evident
- If fewer themes exist, return fewer (don't pad with weak ones)`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = (data.content?.[0]?.text || '').trim();

  try {
    const cleaned = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed  = JSON.parse(cleaned);
    return {
      positive: (Array.isArray(parsed.positive) ? parsed.positive : []).slice(0, 3),
      negative: (Array.isArray(parsed.negative) ? parsed.negative : []).slice(0, 3),
    };
  } catch {
    console.warn('  ⚠ Could not parse keyword response:', text);
    return { positive: [], negative: [] };
  }
}

// ── YAML I/O ─────────────────────────────────────────────────────────────────

function readVenueFile(filePath) {
  return yaml.load(fs.readFileSync(filePath, 'utf8')) || {};
}

function writeVenueFile(filePath, data) {
  const content = yaml.dump(data, { lineWidth: 120, quotingType: '"', forceQuotes: false });
  fs.writeFileSync(filePath, content, 'utf8');
}

// ── Per-venue processor ──────────────────────────────────────────────────────

async function enrichVenue(filePath) {
  const fileName = path.basename(filePath, '.yml');
  const data = readVenueFile(filePath);
  const v    = data.venue;

  if (!v || !v.name) {
    console.log(`  Skipping ${fileName}: no venue.name found`);
    return;
  }

  console.log(`\n── ${v.name}`);

  // 1. Get / cache Place ID ──────────────────────────────────────────────────
  let placeId = v.place_id;
  if (!placeId) {
    process.stdout.write('  Looking up Place ID… ');
    placeId = await findPlaceId(v.name, v.city || 'New York');
    if (!placeId) {
      console.log('not found, skipping');
      return;
    }
    console.log(placeId);
    // Cache it immediately so future runs skip this lookup
    if (!DRY_RUN) {
      data.venue.place_id = placeId;
      writeVenueFile(filePath, data);
    }
  } else {
    console.log(`  Place ID (cached): ${placeId}`);
  }

  // 2. Fetch Place Details ───────────────────────────────────────────────────
  process.stdout.write('  Fetching Place Details… ');
  const details = await getPlaceDetails(placeId);
  if (!details) {
    console.log('no rating data, skipping scores');
    return;
  }
  console.log(`rating ${details.rating} · ${details.user_ratings_total} reviews · ${details.reviews.length} texts`);

  // 3. Compute scores ────────────────────────────────────────────────────────
  const communityScore = computeCommunityScore(details.rating, details.user_ratings_total);
  const dipIndex       = computeDipIndex(v.score, communityScore);
  console.log(`  community_score=${communityScore}  dip_index=${dipIndex}`);

  // 4. Extract keywords ─────────────────────────────────────────────────────
  let keywords = { positive: [], negative: [] };
  if (details.reviews.length > 0) {
    process.stdout.write(`  Extracting keywords from ${details.reviews.length} review(s)… `);
    keywords = await extractKeywords(details.reviews);
    console.log(`+[${keywords.positive.join(', ')}]  -[${keywords.negative.join(', ')}]`);
  } else {
    console.log('  No review text available for keyword extraction');
  }

  // 5. Write back ───────────────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log('  [DRY RUN] Would update YAML with:', {
      communityScore, review_count: details.user_ratings_total, keywords, dipIndex,
    });
    return;
  }

  data.venue = {
    ...data.venue,
    place_id:          placeId,
    community_score:   communityScore,
    review_count:      details.user_ratings_total,
    positive_keywords: keywords.positive,
    negative_keywords: keywords.negative,
    dip_index:         dipIndex,
    last_updated:      new Date().toISOString().split('T')[0],
  };

  writeVenueFile(filePath, data);
  console.log('  ✓ Written to YAML');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Load secrets from Supabase Vault before touching any venue
  process.stdout.write('Loading secrets from Supabase Vault… ');
  const secrets = await loadSecretsFromVault();
  GOOGLE_KEY    = secrets.GOOGLE_PLACES_API_KEY;
  ANTHROPIC_KEY = secrets.ANTHROPIC_API_KEY;
  console.log('✓');

  const allFiles = fs.readdirSync(VENUES_DIR)
    .filter(f => f.endsWith('.yml'))
    .sort()
    .map(f => path.join(VENUES_DIR, f));

  const files = SINGLE_VENUE
    ? allFiles.filter(f => path.basename(f, '.yml') === SINGLE_VENUE)
    : allFiles;

  if (files.length === 0) {
    console.error(SINGLE_VENUE
      ? `No venue file found for slug "${SINGLE_VENUE}"`
      : 'No YAML files found in ' + VENUES_DIR);
    process.exit(1);
  }

  console.log(`Enriching ${files.length} NYC venue(s)${DRY_RUN ? ' [DRY RUN]' : ''}…`);

  let ok = 0, failed = 0;
  for (const file of files) {
    try {
      await enrichVenue(file);
      ok++;
      await sleep(350); // stay well inside Places API rate limits
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${ok} succeeded, ${failed} failed.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
