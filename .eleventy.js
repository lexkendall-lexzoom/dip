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
        const data = readYaml(path.join(cityPath, file));
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
