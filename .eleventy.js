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
        results.push({
          citySlug: cityDir,
          fileSlug: slug,
          ...data
        });
      }
    }
    return results;
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
