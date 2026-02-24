async function loadCmsYaml(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  const text = await response.text();
  return window.jsyaml.load(text) || {};
}

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el && typeof value === 'string' && value.trim()) el.textContent = value;
}

function setMeta(selector, value) {
  const el = document.querySelector(selector);
  if (el && typeof value === 'string' && value.trim()) el.setAttribute('content', value);
}

function setHeroImage(selector, src) {
  const el = document.querySelector(selector);
  if (!el) return;
  if (typeof src === 'string' && src.trim()) {
    el.src = src;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function renderCards(selector, cards = []) {
  const container = document.querySelector(selector);
  if (!container || !Array.isArray(cards) || !cards.length) return;
  container.innerHTML = cards
    .map(
      (card) => `<a class="card" href="${card.url || '#'}">
        ${card.image ? `<img class="card-media" src="${card.image}" alt="${card.title || ''}" loading="lazy"/>` : ''}
        <p class="eyebrow">${card.eyebrow || ''}</p>
        <h2>${card.title || ''}</h2>
        <p>${card.description || ''}</p>
      </a>`
    )
    .join('');
}

async function initCmsPageContent(filePath) {
  try {
    const data = await loadCmsYaml(filePath);
    setText('#cms-page-heading', data?.page?.heading);
    setText('#cms-page-intro', data?.page?.intro);
    setHeroImage('#cms-page-hero-image', data?.page?.hero_image);
    setMeta('meta[name="description"]', data?.seo?.description);
    setMeta('meta[property="og:title"]', data?.seo?.title);
    setMeta('meta[property="og:description"]', data?.seo?.description);
    if (typeof data?.seo?.title === 'string' && data.seo.title.trim()) document.title = data.seo.title;
    renderCards('#cms-page-cards', data?.cards || []);
  } catch (error) {
    console.error('CMS content load failed:', error);
  }
}
