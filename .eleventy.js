const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const nunjucks = require('nunjucks');
const CORE_TYPES = ['sauna', 'steam_bath', 'hot_spring', 'thermal_bath', 'cold_plunge', 'bathhouse', 'spa_ritual'];
const CULTURAL_TRADITIONS = ['finnish_sauna', 'russian_banya', 'japanese_onsen', 'japanese_sento', 'korean_jjimjilbang', 'turkish_hammam', 'roman_thermal_bath', 'icelandic_geothermal_pool', 'indigenous_sweat_lodge'];
const MODERN_FORMATS = ['urban_bathhouse', 'luxury_bathhouse', 'social_sauna', 'wellness_spa', 'hot_spring_resort'];

module.exports = function(eleventyConfig) {

  // ── Passthrough copies ──────────────────────────────────
  eleventyConfig.addPassthroughCopy("images");
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("admin");
  eleventyConfig.addPassthroughCopy("content");
  eleventyConfig.addPassthroughCopy("fonts");
  eleventyConfig.addPassthroughCopy("robots.txt");
  eleventyConfig.addPassthroughCopy({ "public": "." });

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



  function normalizeVenueData(data) {
    const venue = (data && typeof data === "object" && data.venue && typeof data.venue === "object") ? data.venue : {};
    const seo = (data && typeof data === "object" && data.seo && typeof data.seo === "object") ? data.seo : {};

    const legacyGallery = Array.isArray(venue.gallery_images)
      ? venue.gallery_images
          .map((image) => {
            if (typeof image === 'string') return image;
            if (image && typeof image === 'object') return image.image || image.src || image.url || '';
            return '';
          })
          .filter(Boolean)
      : [];

    const gallery = Array.isArray(venue.gallery)
      ? venue.gallery
          .map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') return item.image || item.src || item.url || '';
            return '';
          })
          .filter((item) => typeof item === 'string' && item.trim().length > 0)
      : legacyGallery;

    const sourceUrls = Array.isArray(venue.source_urls)
      ? venue.source_urls
          .map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') return item.source_url || item.url || '';
            return '';
          })
          .filter((item) => typeof item === 'string' && item.trim().length > 0)
      : [];

    // Keep both legacy and new keys so existing templates/pages continue to render while CMS moves to the new schema.
    const normalizedVenue = {
      ...venue,
      status: venue.status || 'draft',
      short_description: venue.short_description || venue.best_for || venue.subtitle || '',
      long_description: venue.long_description || venue.review || '',
      tagline: venue.tagline || venue.subtitle || '',
      price_tier: venue.price_tier || venue.price || '',
      last_verified_at: venue.last_verified_at || venue.date_reviewed || '',
      gallery,
      gallery_images: gallery.map((image) => ({ image })),
      subtitle: venue.subtitle || venue.tagline || '',
      review: venue.review || venue.long_description || '',
      best_for: venue.best_for || venue.short_description || '',
      price: venue.price || venue.price_tier || '',
      date_reviewed: venue.date_reviewed || venue.last_verified_at || '',
      hero_image: venue.hero_image || venue.seo_image || seo.social_image || gallery[0] || '',
      source_urls: sourceUrls,
    };

    return {
      ...data,
      seo: {
        ...seo,
        title: seo.title || normalizedVenue.seo_title || '',
        description: seo.description || normalizedVenue.seo_description || '',
        social_image: seo.social_image || normalizedVenue.seo_image || normalizedVenue.hero_image || '',
      },
      venue: normalizedVenue,
    };
  }



  const toSlug = (value) => String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const startCase = (value) => String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

  const ritualLabelMap = {
    sauna: 'Sauna',
    onsen: 'Onsen',
    banya: 'Banya',
    hammam: 'Hammam',
    'hot-spring': 'Hot Spring',
  };

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

  // ── Global data: all venues ─────────────────────────────
  eleventyConfig.addGlobalData("venues", () => {
    const venuesDir = path.join(__dirname, 'content', 'venues');
    const results = [];
    if (!fs.existsSync(venuesDir)) return results;

    const cityDirs = fs.readdirSync(venuesDir).filter(d =>
      fs.statSync(path.join(venuesDir, d)).isDirectory()
    );

    for (const cityDir of cityDirs) {
      const cityPath = path.join(venuesDir, cityDir);
      const files = fs.readdirSync(cityPath).filter(f => f.endsWith('.yml'));
      for (const file of files) {
        const data = normalizeVenueData(readYaml(path.join(cityPath, file)));
        const slug = file.replace('.yml', '');
        const venue = data.venue || {};
        const lat = typeof venue.lat === 'number' ? venue.lat : Number(venue.lat);
        const lng = typeof venue.lng === 'number' ? venue.lng : Number(venue.lng);
        const cityMetadata = {
          city: venue.city || cityDir.replace(/-/g, ' '),
          country: venue.country || '',
          lat: Number.isFinite(lat) ? lat : 0,
          lng: Number.isFinite(lng) ? lng : 0,
        };

        results.push({
          citySlug: cityDir,
          fileSlug: slug,
          ...data,
          venue: {
            ...venue,
            city_metadata: venue.city_metadata || cityMetadata,
          },
        });
      }
    }
    return results;
  });



  // ── Global data: venue detail paths (id → rich object) ──
  // Key  = venue.id field from YAML (falls back to fileSlug).
  // Value = { path, img, score, price, hours, name, hood }
  // Consumed by the landing page instead of the old hand-written VENUE_PAGE_PATHS.
  eleventyConfig.addGlobalData("venuePagePaths", () => {
    const venuesDir = path.join(__dirname, 'content', 'venues');
    const result = {};
    if (!fs.existsSync(venuesDir)) return result;

    const cityDirs = fs.readdirSync(venuesDir).filter(d =>
      fs.statSync(path.join(venuesDir, d)).isDirectory()
    );

    for (const cityDir of cityDirs) {
      const cityPath = path.join(venuesDir, cityDir);
      const files = fs.readdirSync(cityPath).filter(f => f.endsWith('.yml'));
      for (const file of files) {
        const data = readYaml(path.join(cityPath, file));
        const venue = (data && data.venue) ? data.venue : {};
        const fileSlug = file.replace('.yml', '');
        const id = venue.id || fileSlug;
        const pageSlug = venue.slug || fileSlug;
        result[id] = {
          path:  `/${cityDir}/${pageSlug}/`,
          img:   venue.hero_image || '',
          score: venue.score != null ? String(venue.score) : '',
          price: venue.price || '',
          hours: venue.hours || '',
          name:  venue.name  || '',
          hood:  venue.neighborhood || '',
        };
      }
    }
    return result;
  });

  eleventyConfig.addGlobalData("taxonomy", () => ({
    core_types: CORE_TYPES,
    cultural_traditions: CULTURAL_TRADITIONS,
    modern_formats: MODERN_FORMATS,
  }));

  eleventyConfig.addGlobalData("cityTaxonomyPages", () => {
    const fallbackVenues = (() => {
      const venuesDir = path.join(__dirname, 'content', 'venues');
      const rows = [];
      if (!fs.existsSync(venuesDir)) return rows;
      const cityDirs = fs.readdirSync(venuesDir).filter(d => fs.statSync(path.join(venuesDir, d)).isDirectory());
      cityDirs.forEach((cityDir) => {
        fs.readdirSync(path.join(venuesDir, cityDir)).filter(f => f.endsWith('.yml')).forEach((file) => {
          const data = normalizeVenueData(readYaml(path.join(venuesDir, cityDir, file)));
          rows.push({ citySlug: cityDir, fileSlug: file.replace('.yml', ''), ...data });
        });
      });
      return rows;
    })();

    const cityMap = new Map();
    fallbackVenues.forEach((item) => {
      const citySlug = item.citySlug || toSlug(item.venue?.city || '');
      if (!citySlug) return;
      const venue = item.venue || {};
      const score = Number(venue.score);
      const list = cityMap.get(citySlug) || [];
      list.push({ ...item, score: Number.isFinite(score) ? score : 0 });
      cityMap.set(citySlug, list);
    });

    const desired = [
      'new-york','london','helsinki','tokyo','seoul','sydney','mexico-city','san-francisco','berlin','paris','madrid','miami','los-angeles','budapest','istanbul','reykjavik','bangkok','dubai'
    ];

    return desired.map((slug) => {
      const cityVenues = cityMap.get(slug) || [];
      const rituals = new Map();
      cityVenues.forEach(({ venue }) => {
        (venue.ritual_elements || venue.rituals || []).forEach((ritual) => {
          const key = toSlug(ritual).replace(/_/g, '-');
          rituals.set(key, (rituals.get(key) || 0) + 1);
        });
        if (venue.core_type) {
          const key = toSlug(venue.core_type).replace(/_/g, '-');
          rituals.set(key, (rituals.get(key) || 0) + 1);
        }
      });
      const topRituals = [...rituals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([key,count])=>({ key, label: startCase(key), count }));
      const featuredVenues = [...cityVenues].sort((a,b)=>b.score-a.score).slice(0,6);
      return { slug, cityName: startCase(slug), venues: cityVenues, topRituals, featuredVenues };
    });
  });

  eleventyConfig.addGlobalData("ritualPages", () => {
    const rituals = [
      { slug: 'sauna', label: 'Sauna', aliases: ['sauna'] },
      { slug: 'onsen', label: 'Onsen', aliases: ['onsen', 'japanese_onsen', 'hot_spring'] },
      { slug: 'banya', label: 'Banya', aliases: ['banya', 'russian_banya'] },
      { slug: 'hammam', label: 'Hammam', aliases: ['hammam', 'turkish_hammam'] },
      { slug: 'hot-spring', label: 'Hot Spring', aliases: ['hot-spring', 'hot_spring'] },
    ];
    const venuesDir = path.join(__dirname, 'content', 'venues');
    const all = [];
    if (fs.existsSync(venuesDir)) {
      fs.readdirSync(venuesDir).filter(d => fs.statSync(path.join(venuesDir, d)).isDirectory()).forEach((cityDir) => {
        fs.readdirSync(path.join(venuesDir, cityDir)).filter(f => f.endsWith('.yml')).forEach((file) => {
          const data = normalizeVenueData(readYaml(path.join(venuesDir, cityDir, file)));
          all.push({ citySlug: cityDir, fileSlug: file.replace('.yml',''), ...data });
        });
      });
    }

    return rituals.map((ritual) => {
      const matches = all.filter((item) => {
        const v = item.venue || {};
        const values = [v.core_type, v.cultural_tradition, ...(v.ritual_elements || []), ...(v.rituals || [])]
          .map((it) => toSlug(String(it || '')).replace(/_/g, '-'));
        return ritual.aliases.some((alias) => values.includes(toSlug(alias).replace(/_/g, '-')));
      });
      const cityCounts = new Map();
      matches.forEach((item) => cityCounts.set(item.citySlug, (cityCounts.get(item.citySlug) || 0) + 1));
      const topCities = [...cityCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([slug,count])=>({ slug, label:startCase(slug), count }));
      return { ...ritual, venues: matches, topCities };
    });
  });

  eleventyConfig.addGlobalData("cityRitualPages", () => ([
    { ritual: 'sauna', city: 'helsinki' },
    { ritual: 'onsen', city: 'tokyo' },
    { ritual: 'banya', city: 'new-york' },
    { ritual: 'hammam', city: 'istanbul' },
  ].map((item) => ({ ...item, ritualLabel: ritualLabelMap[item.ritual] || startCase(item.ritual), cityLabel: startCase(item.city) }))));

  // ── Nunjucks filter: community_score (0–5) → star string ─
  eleventyConfig.addFilter("stars", function(score) {
    const val  = Math.round((parseFloat(score) || 0) * 2) / 2; // round to nearest 0.5
    const full = Math.min(5, Math.floor(val));
    const half = (val - full) >= 0.5 ? 1 : 0;
    const empty = Math.max(0, 5 - full - half);
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  });

  // ── Nunjucks filter: split text on double-newlines into <p> tags ──
  eleventyConfig.addFilter("paragraphs", function(value) {
    if (!value) return "";
    const html = value.split(/\n\n+/).filter(p => p.trim()).map(p => `<p>${p.trim()}</p>`).join("\n");
    return new nunjucks.runtime.SafeString(html);
  });

  // ── Nunjucks filter: JSON output without HTML escaping ───
  eleventyConfig.addFilter("json", function(value) {
    return new nunjucks.runtime.SafeString(JSON.stringify(value));
  });

  // ── Nunjucks filter: URL-encode a string for use in query parameters ──
  eleventyConfig.addFilter("urlencode", function(value) {
    return encodeURIComponent(value || "");
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
