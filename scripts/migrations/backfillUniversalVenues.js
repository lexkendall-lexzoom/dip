#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const root = process.cwd();
const venuesRoot = path.join(root, 'content', 'venues');
const universalDir = path.join(venuesRoot, '_universal');
const shouldWrite = process.argv.includes('--write');

const citySlugByName = {
  'new york city': 'new-york-city',
  'los angeles': 'los-angeles',
  'miami': 'miami',
  'san francisco': 'san-francisco',
  'chicago': 'chicago',
  'berlin': 'berlin'
};

function normalizeCitySlug(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const raw = value.trim();
  if (!raw) return fallback;
  const mapped = citySlugByName[raw.toLowerCase()];
  if (mapped) return mapped;
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function readYaml(filePath) {
  try {
    return yaml.load(fs.readFileSync(filePath, 'utf8')) || {};
  } catch (error) {
    process.stderr.write(`Skipping unreadable file ${filePath}: ${error.message}\n`);
    return null;
  }
}

function writeYaml(filePath, data) {
  const payload = yaml.dump(data, { lineWidth: 120, noRefs: true });
  fs.writeFileSync(filePath, payload, 'utf8');
}

if (!fs.existsSync(venuesRoot)) {
  process.stderr.write(`No venues folder found at ${venuesRoot}.\n`);
  process.exit(1);
}

fs.mkdirSync(universalDir, { recursive: true });

const cityDirs = fs.readdirSync(venuesRoot).filter((entry) => {
  const fullPath = path.join(venuesRoot, entry);
  return fs.statSync(fullPath).isDirectory() && entry !== '_universal';
});

const summary = {
  scanned: 0,
  alreadyPresent: 0,
  prepared: 0,
  written: 0
};

for (const cityDir of cityDirs) {
  const cityPath = path.join(venuesRoot, cityDir);
  const files = fs.readdirSync(cityPath).filter((file) => file.endsWith('.yml'));

  for (const file of files) {
    summary.scanned += 1;
    const sourcePath = path.join(cityPath, file);
    const data = readYaml(sourcePath);
    if (!data) continue;

    const venue = data.venue || {};
    const inferredCitySlug = normalizeCitySlug(venue.city_slug || venue.city, cityDir);
    const venueSlug = venue.slug || path.basename(file, '.yml');
    const universalFilename = `${venueSlug}-${inferredCitySlug}.yml`;
    const targetPath = path.join(universalDir, universalFilename);

    if (fs.existsSync(targetPath)) {
      summary.alreadyPresent += 1;
      continue;
    }

    const nextData = {
      ...data,
      venue: {
        ...venue,
        slug: venueSlug,
        city_slug: inferredCitySlug
      }
    };

    summary.prepared += 1;

    if (shouldWrite) {
      writeYaml(targetPath, nextData);
      summary.written += 1;
    }
  }
}

process.stdout.write(`Legacy venues scanned: ${summary.scanned}\n`);
process.stdout.write(`Already in universal: ${summary.alreadyPresent}\n`);
process.stdout.write(`Ready to backfill: ${summary.prepared}\n`);
if (shouldWrite) {
  process.stdout.write(`Written to content/venues/_universal: ${summary.written}\n`);
} else {
  process.stdout.write('Dry run complete. Re-run with --write to create files.\n');
}
