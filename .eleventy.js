const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const nunjucks = require('nunjucks');

module.exports = function(eleventyConfig) {

  // ── Passthrough copies ──────────────────────────────────
  eleventyConfig.addPassthroughCopy("images");
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("admin");
  eleventyConfig.addPassthroughCopy("content");
  eleventyConfig.addPassthroughCopy("fonts");
  eleventyConfig.addPassthroughCopy("robots.txt");

  // ── Helper: read a YAML file ────────────────────────────
  function readYaml(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return yaml.load(content) || {};
    } catch (e) {
      console.warn(`Warning: Could not read ${filePath}:`, e.message);
      return {};
    }
  }

  // ── Global data: homepage ───────────────────────────────
  eleventyConfig.addGlobalData("homepage", () => {
    return readYaml(path.join(__dirname, 'content', 'homepage.yml'));
  });

  // ── Global data: city pages ─────────────────────────────
  eleventyConfig.addGlobalData("cityPages", () => {
    const pagesDir = path.join(__dirname, 'content', 'pages');
    const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.yml') && f !== 'cities.yml');
    return files.map(f => {
      const slug = f.replace('.yml', '');
      const data = readYaml(path.join(pagesDir, f));
      return { slug, ...data };
    });
  });

  // ── Global data: cities page ────────────────────────────
  eleventyConfig.addGlobalData("citiesPage", () => {
    return readYaml(path.join(__dirname, 'content', 'pages', 'cities.yml'));
  });

  // ── Global data: all venues (legacy + universal) ───────
  eleventyConfig.addGlobalData("venues", () => {
    const venuesDir = path.join(__dirname, 'content', 'venues');
    const universalDirName = '_universal';
    const citySlugByName = {
      'new york city': 'new-york-city',
      'los angeles': 'los-angeles',
      'miami': 'miami',
      'san francisco': 'san-francisco',
      'chicago': 'chicago',
      'berlin': 'berlin'
    };

    if (!fs.existsSync(venuesDir)) return [];

    function normalizeCitySlug(value, fallback = '') {
      if (typeof value !== 'string') return fallback;
      const raw = value.trim();
      if (!raw) return fallback;
      const byName = citySlugByName[raw.toLowerCase()];
      if (byName) return byName;
      return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    function parseVenueRecord(filePath, defaultCitySlug, sourceType) {
      const data = readYaml(filePath);
      const fileSlug = path.basename(filePath, '.yml');
      const explicitCitySlug = normalizeCitySlug(data?.venue?.city_slug);
      const inferredCitySlug = normalizeCitySlug(data?.venue?.city);
      const assignedCitySlug = explicitCitySlug || inferredCitySlug || defaultCitySlug;
      const routeCitySlug = assignedCitySlug || defaultCitySlug;
      const venueSlug = data?.venue?.slug || fileSlug;

      return {
        citySlug: routeCitySlug,
        assignedCitySlug,
        fileSlug,
        sourceType,
        ...data,
        venue: {
          ...(data?.venue || {}),
          slug: venueSlug,
          city_slug: assignedCitySlug
        }
      };
    }

    const legacyVenues = [];
    const cityDirs = fs.readdirSync(venuesDir).filter((d) => {
      const fullPath = path.join(venuesDir, d);
      return fs.statSync(fullPath).isDirectory() && d !== universalDirName;
    });

    for (const cityDir of cityDirs) {
      const cityPath = path.join(venuesDir, cityDir);
      const files = fs.readdirSync(cityPath).filter((f) => f.endsWith('.yml'));
      for (const file of files) {
        legacyVenues.push(parseVenueRecord(path.join(cityPath, file), cityDir, 'legacy'));
      }
    }

    const mergedByRoute = new Map(
      legacyVenues.map((item) => [`${item.citySlug}::${item.venue.slug}`, item])
    );

    const universalPath = path.join(venuesDir, universalDirName);
    if (fs.existsSync(universalPath)) {
      const universalFiles = fs.readdirSync(universalPath).filter((f) => f.endsWith('.yml'));
      for (const file of universalFiles) {
        const universalItem = parseVenueRecord(path.join(universalPath, file), '', 'universal');
        const key = `${universalItem.citySlug}::${universalItem.venue.slug}`;
        mergedByRoute.set(key, universalItem);
      }
    }

    return Array.from(mergedByRoute.values());
  });

  // ── Nunjucks filter: safe output for HTML ───────────────
  eleventyConfig.addFilter("safe", function(value) {
    return value;
  });

  // ── Nunjucks filter: JSON output without HTML escaping ───
  eleventyConfig.addFilter("json", function(value) {
    return new nunjucks.runtime.SafeString(JSON.stringify(value));
  });

  // ── Nunjucks filter: normalize CMS image values to public paths ──
  eleventyConfig.addFilter("assetUrl", function(value) {
    if (typeof value !== "string") return "";
    const v = value.trim();
    if (!v) return "";
    if (
      v.startsWith("/") ||
      v.startsWith("http://") ||
      v.startsWith("https://") ||
      v.startsWith("data:") ||
      v.startsWith("blob:")
    ) {
      return v;
    }
    return `/images/uploads/${v.replace(/^\.?\/*/, "")}`;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["njk", "html", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};
