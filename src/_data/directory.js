const fs = require('fs');
const path = require('path');

const INDEX_THRESHOLD = 3;

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function titleize(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeAmenity(feature) {
  const value = String(feature || '').trim();
  if (!value) return null;
  const slug = slugify(value.replace(/_/g, ' '));
  if (!slug) return null;
  return { slug, name: titleize(slug) };
}

function getVenueTypes(venue) {
  const base = ['LocalBusiness'];
  const isSpa = (venue.categories || []).some((c) => /spa/i.test(c)) || /spa/i.test(venue.primary_category || '');
  const isHealthClub = (venue.features || []).some((f) => ['cold_plunge', 'recovery', 'sauna'].includes(f));
  if (isSpa) base.push('Spa');
  if (isHealthClub) base.push('HealthClub');
  return base;
}

module.exports = () => {
  const venuesDir = path.join(process.cwd(), 'data', 'processed', 'venues');
  if (!fs.existsSync(venuesDir)) {
    return {
      indexThreshold: INDEX_THRESHOLD,
      venues: [],
      cityPages: [],
      venuePages: [],
      categoryPages: [],
      amenityPages: [],
      cityFacetPages: []
    };
  }

  const venues = fs.readdirSync(venuesDir)
    .filter((file) => file.endsWith('.canonical.json'))
    .map((file) => JSON.parse(fs.readFileSync(path.join(venuesDir, file), 'utf8')))
    .map((venue) => {
      const citySlug = slugify(venue.city);
      const categorySlug = slugify(venue.primary_category);
      const categoryName = venue.primary_category || 'Wellness Venue';
      const amenities = [...new Map((venue.features || [])
        .map(normalizeAmenity)
        .filter(Boolean)
        .map((item) => [item.slug, item])).values()];
      const bathingStyle = venue.venue_type ? {
        slug: slugify(venue.venue_type),
        name: titleize(slugify(venue.venue_type))
      } : null;

      return {
        ...venue,
        citySlug,
        cityName: venue.city,
        categorySlug,
        categoryName,
        amenities,
        bathingStyle,
        path: `/${citySlug}/${venue.slug}/`,
        cityPath: `/${citySlug}/`,
        categoryPath: `/categories/${categorySlug}/`
      };
    });

  const cityMap = new Map();
  const categoryMap = new Map();
  const amenityMap = new Map();
  const cityCategoryMap = new Map();
  const cityAmenityMap = new Map();
  const cityBathingMap = new Map();

  for (const venue of venues) {
    if (!cityMap.has(venue.citySlug)) cityMap.set(venue.citySlug, { slug: venue.citySlug, name: venue.cityName, venues: [] });
    cityMap.get(venue.citySlug).venues.push(venue);

    if (!categoryMap.has(venue.categorySlug)) categoryMap.set(venue.categorySlug, { slug: venue.categorySlug, name: venue.categoryName, venues: [] });
    categoryMap.get(venue.categorySlug).venues.push(venue);

    const ccKey = `${venue.citySlug}::${venue.categorySlug}`;
    if (!cityCategoryMap.has(ccKey)) cityCategoryMap.set(ccKey, { citySlug: venue.citySlug, cityName: venue.cityName, slug: venue.categorySlug, name: venue.categoryName, facetType: 'category', venues: [] });
    cityCategoryMap.get(ccKey).venues.push(venue);

    if (venue.bathingStyle?.slug) {
      const cbKey = `${venue.citySlug}::${venue.bathingStyle.slug}`;
      if (!cityBathingMap.has(cbKey)) cityBathingMap.set(cbKey, { citySlug: venue.citySlug, slug: venue.bathingStyle.slug, name: venue.bathingStyle.name, venues: [] });
      cityBathingMap.get(cbKey).venues.push(venue);
    }

    for (const amenity of venue.amenities) {
      if (!amenityMap.has(amenity.slug)) amenityMap.set(amenity.slug, { slug: amenity.slug, name: amenity.name, venues: [] });
      amenityMap.get(amenity.slug).venues.push(venue);

      const caKey = `${venue.citySlug}::${amenity.slug}`;
      if (!cityAmenityMap.has(caKey)) cityAmenityMap.set(caKey, { citySlug: venue.citySlug, cityName: venue.cityName, slug: amenity.slug, name: amenity.name, facetType: 'amenity', venues: [] });
      cityAmenityMap.get(caKey).venues.push(venue);
    }
  }

  const isIndexable = (count) => count >= INDEX_THRESHOLD;
  const venueSlugSet = new Set(venues.map((v) => `${v.citySlug}/${v.slug}`));

  const cityPages = [...cityMap.values()].map((city) => {
    const topCategories = [...new Map(city.venues.map((v) => [v.categorySlug, { slug: v.categorySlug, name: v.categoryName, count: 0 }])).values()];
    for (const category of topCategories) {
      category.count = city.venues.filter((v) => v.categorySlug === category.slug).length;
      category.path = `/${city.slug}/${category.slug}/`;
      category.indexable = isIndexable(category.count);
    }
    const amenityCounts = new Map();
    for (const venue of city.venues) {
      for (const amenity of venue.amenities) amenityCounts.set(amenity.slug, { ...amenity, count: (amenityCounts.get(amenity.slug)?.count || 0) + 1 });
    }
    const topAmenities = [...amenityCounts.values()].sort((a, b) => b.count - a.count).slice(0, 8).map((a) => ({ ...a, path: `/${city.slug}/${a.slug}/`, indexable: isIndexable(a.count) }));

    return {
      slug: city.slug,
      name: city.name,
      venues: city.venues,
      venueCount: city.venues.length,
      indexable: isIndexable(city.venues.length),
      path: `/${city.slug}/`,
      intro: `Explore ${city.name}'s bathhouses, spas, and recovery clubs with DipDays directory data.`,
      featuredVenues: city.venues.slice(0, 6),
      topCategories: topCategories.sort((a, b) => b.count - a.count).slice(0, 6),
      relevantAmenities: topAmenities
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const categoryPages = [...categoryMap.values()].map((category) => {
    const cityCounts = new Map();
    for (const venue of category.venues) {
      cityCounts.set(venue.citySlug, { citySlug: venue.citySlug, cityName: venue.cityName, count: (cityCounts.get(venue.citySlug)?.count || 0) + 1 });
    }
    const cities = [...cityCounts.values()].sort((a, b) => b.count - a.count).map((city) => ({ ...city, path: `/${city.citySlug}/${category.slug}/`, indexable: isIndexable(city.count) }));
    return {
      slug: category.slug,
      name: category.name,
      venues: category.venues,
      venueCount: category.venues.length,
      indexable: isIndexable(category.venues.length),
      path: `/categories/${category.slug}/`,
      intro: `${category.name} venues across DipDays cities, generated from structured listings.`,
      cities
    };
  }).sort((a, b) => b.venueCount - a.venueCount);

  const amenityPages = [...amenityMap.values()].map((amenity) => ({
    slug: amenity.slug,
    name: amenity.name,
    venues: amenity.venues,
    venueCount: amenity.venues.length,
    indexable: isIndexable(amenity.venues.length),
    path: `/amenities/${amenity.slug}/`,
    intro: `Find venues with ${amenity.name.toLowerCase()} across DipDays cities.`
  })).sort((a, b) => b.venueCount - a.venueCount);

  const cityFacetPages = [...cityCategoryMap.values(), ...cityAmenityMap.values()]
    .filter((item) => !venueSlugSet.has(`${item.citySlug}/${item.slug}`))
    .reduce((acc, item) => {
      const key = `${item.citySlug}/${item.slug}`;
      if (!acc.has(key) || acc.get(key).facetType === 'amenity') acc.set(key, item);
      return acc;
    }, new Map());

  const cityFacetList = [...cityFacetPages.values()].map((item) => ({
    ...item,
    venueCount: item.venues.length,
    indexable: isIndexable(item.venues.length),
    path: `/${item.citySlug}/${item.slug}/`,
    intro: item.facetType === 'category'
      ? `${item.name} culture in ${item.cityName}: a focused list of top places from DipDays data.`
      : `${item.name} spots in ${item.cityName}: compare venues with this amenity.`,
    kindLabel: item.facetType === 'category' ? 'Category' : 'Amenity'
  })).sort((a, b) => b.venueCount - a.venueCount);

  const venuePages = venues.map((venue) => {
    const cityCount = cityMap.get(venue.citySlug)?.venues.length || 0;
    const categoryCount = categoryMap.get(venue.categorySlug)?.venues.length || 0;
    const bathingCount = venue.bathingStyle?.slug ? (cityBathingMap.get(`${venue.citySlug}::${venue.bathingStyle.slug}`)?.venues.length || 0) : 0;

    return {
      ...venue,
      indexable: true,
      linkGraph: {
        city: { name: venue.cityName, path: venue.cityPath, indexable: isIndexable(cityCount) },
        category: { name: venue.categoryName, path: venue.categoryPath, indexable: isIndexable(categoryCount) },
        bathingStyle: venue.bathingStyle ? { name: venue.bathingStyle.name, path: `/${venue.citySlug}/${venue.bathingStyle.slug}/`, indexable: isIndexable(bathingCount) } : null,
        amenities: venue.amenities.map((amenity) => {
          const count = amenityMap.get(amenity.slug)?.venues.length || 0;
          return { ...amenity, path: `/amenities/${amenity.slug}/`, cityPath: `/${venue.citySlug}/${amenity.slug}/`, indexable: isIndexable(count) };
        })
      },
      schema: {
        '@context': 'https://schema.org',
        '@type': getVenueTypes(venue),
        name: venue.name,
        url: `https://dipdays.com/${venue.citySlug}/${venue.slug}/`,
        image: [],
        address: {
          '@type': 'PostalAddress',
          addressLocality: venue.city,
          addressCountry: venue.country
        },
        geo: venue.coordinates ? {
          '@type': 'GeoCoordinates',
          latitude: venue.coordinates.lat,
          longitude: venue.coordinates.lng
        } : undefined,
        sameAs: venue.website ? [venue.website] : undefined
      }
    };
  });

  return {
    indexThreshold: INDEX_THRESHOLD,
    venues,
    cityPages,
    venuePages,
    categoryPages,
    amenityPages,
    cityFacetPages: cityFacetList
  };
};
