async function loadVenueYaml(path) {
  const cacheBustPath = `${path}${path.includes('?') ? '&' : '?'}v=${Date.now()}`;
  const response = await fetch(cacheBustPath, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  const text = await response.text();
  return window.jsyaml.load(text) || {};
}

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el && typeof value === 'string' && value.trim()) el.textContent = value;
}

function setAttr(selector, attr, value) {
  const el = document.querySelector(selector);
  if (el && typeof value === 'string' && value.trim()) el.setAttribute(attr, value);
}


function normalizeMediaUrl(value) {
  if (typeof value !== 'string') return '';
  const src = value.trim();
  if (!src) return '';
  if (/^(https?:)?\/\//i.test(src) || src.startsWith('data:') || src.startsWith('blob:')) return src;
  if (src.startsWith('/')) return src;
  return `/${src}`;
}

function inferVenueContentPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const city = parts[0];
  const slug = parts[1];
  return `/content/venues/${city}/${slug}.yml`;
}

function renderFacts(data = {}) {
  const facts = document.querySelector('.facts');
  if (!facts) return;

  const entries = [
    ['Neighborhood', data.neighborhood || ''],
    ['Price', data.price || ''],
    ['Score', data.score || ''],
    ['Date reviewed', data.date_reviewed || ''],
  ];

  facts.innerHTML = entries
    .map(([label, value]) => `<div class="fact"><b>${label}</b>${value || ''}</div>`)
    .join('') + `<div class="fact wide"><b>Hours</b>${data.hours || ''}</div>`;
}

function renderBestFor(value) {
  const candidates = Array.from(document.querySelectorAll('article p'));
  const row = candidates.find((p) => p.querySelector('strong')?.textContent?.toLowerCase().includes('best for'));
  if (!row || typeof value !== 'string') return;
  row.innerHTML = `<strong>Best for:</strong> ${value}`;
}



function normalizeGalleryImages(images = []) {
  if (!Array.isArray(images)) return [];
  return images
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.image || item.src || item.url || '';
      return '';
    })
    .map((src) => normalizeMediaUrl(src))
      if (item && typeof item === 'object') return item.image || item.src || '';
      return '';
    })
    .filter((src) => typeof src === 'string' && src.trim());
}

function renderGallery(images = [], venueName = 'Venue') {
  const track = document.querySelector('[data-track]');
  const dotsWrap = document.querySelector('.dots');
  const normalizedImages = normalizeGalleryImages(images);
  if (!track || !dotsWrap || !normalizedImages.length) return;

  track.innerHTML = normalizedImages
    .map(
      (src, i) => `<div class="slide"><img src="${src}" alt="${venueName} photo ${i + 1}" loading="lazy"/></div>`
    )
    .join('');

  dotsWrap.innerHTML = normalizedImages
    .map(
      (_, i) =>
        `<button class="dot${i === 0 ? ' active' : ''}" type="button" data-dot="${i}" aria-label="Slide ${i + 1}"></button>`
    )
    .join('');
}

function initCarousel() {
  document.querySelectorAll('[data-carousel]').forEach((carousel) => {
    const track = carousel.querySelector('[data-track]');
    const slides = Array.from(track?.children || []);
    const prev = carousel.querySelector('[data-prev]');
    const next = carousel.querySelector('[data-next]');
    const dots = () => Array.from(carousel.querySelectorAll('[data-dot]'));
    if (!track || !slides.length || !prev || !next) return;

    let index = 0;
    function render() {
      track.style.transform = `translateX(-${index * 100}%)`;
      track.style.transition = 'transform 260ms ease';
      dots().forEach((d, i) => d.classList.toggle('active', i === index));
    }

    prev.onclick = () => {
      index = (index - 1 + slides.length) % slides.length;
      render();
    };

    next.onclick = () => {
      index = (index + 1) % slides.length;
      render();
    };

    dots().forEach((dot, i) => {
      dot.onclick = () => {
        index = i;
        render();
      };
    });

    render();
  });
}

async function initCmsVenueContent() {
  const filePath = inferVenueContentPath();
  if (!filePath) {
    initCarousel();
    return;
  }

  try {
    const data = await loadVenueYaml(filePath);
    const venue = data?.venue || {};
    const seo = data?.seo || {};

    setText('h1', venue.name);
    setText('.sub', venue.subtitle);
    setText('.desc', venue.review);

    setAttr('.hero-media > img', 'src', normalizeMediaUrl(venue.hero_image || seo.social_image));
    setAttr('.hero-media > img', 'src', venue.hero_image || seo.social_image);
    setAttr('.hero-media > img', 'alt', `${venue.name || 'Venue'} hero image`);

    setAttr('.cta', 'href', venue.website_url);

    const chipLabels = Array.from(document.querySelectorAll('.chip'));
    if (chipLabels.length > 0) setText('.chip:first-child', venue.category || venue.type);

    setAttr('meta[name="description"]', 'content', seo.description);
    setAttr('meta[property="og:title"]', 'content', seo.title);
    setAttr('meta[property="og:description"]', 'content', seo.description);
    setAttr('meta[property="og:image"]', 'content', normalizeMediaUrl(seo.social_image || venue.hero_image));
    setAttr('meta[property="og:image"]', 'content', seo.social_image || venue.hero_image);

    if (typeof seo.title === 'string' && seo.title.trim()) document.title = seo.title;

    renderFacts(venue);
    renderBestFor(venue.best_for);
    renderGallery(venue.gallery_images, venue.name || 'Venue');
  } catch (error) {
    console.error('CMS venue content load failed:', error);
  } finally {
    initCarousel();
  }
}

window.initCmsVenueContent = initCmsVenueContent;
