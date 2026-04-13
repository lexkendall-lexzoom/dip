const CACHE_VERSION = 'v1';
const STATIC_CACHE = `dipdays-static-${CACHE_VERSION}`;
const PAGES_CACHE = `dipdays-pages-${CACHE_VERSION}`;
const IMAGES_CACHE = `dipdays-images-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/offline.html',
  '/icons/icon.svg',
  '/manifest.json',
];

const PRECACHE_PAGES = [
  '/',
  '/cities/',
];

// Max entries per cache
const IMAGES_CACHE_MAX = 60;
const PAGES_CACHE_MAX = 30;

// ── Install: pre-cache critical assets ──────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
      caches.open(PAGES_CACHE).then((cache) => cache.addAll(PRECACHE_PAGES)),
    ]).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE, PAGES_CACHE, IMAGES_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !currentCaches.includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ──────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and cross-origin requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Skip Netlify functions / API calls — always network
  if (url.pathname.startsWith('/.netlify/') || url.pathname.startsWith('/api/')) return;

  // Fonts & static assets from CDN — network first, no cache
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) return;

  // Images — cache first, fallback to network, store in images cache
  if (isImage(url.pathname)) {
    event.respondWith(cacheFirst(request, IMAGES_CACHE, IMAGES_CACHE_MAX));
    return;
  }

  // Static files (icons, manifest) — cache first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML pages — stale-while-revalidate with offline fallback
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(staleWhileRevalidateWithOfflineFallback(request));
    return;
  }
});

// ── Strategies ───────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      if (maxEntries) await trimCache(cache, maxEntries - 1);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 408 });
  }
}

async function staleWhileRevalidateWithOfflineFallback(request) {
  const cache = await caches.open(PAGES_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        trimCache(cache, PAGES_CACHE_MAX - 1).then(() => cache.put(request, response.clone()));
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Return cached immediately, update in background
    fetchPromise; // fire and forget
    return cached;
  }

  // No cache — wait for network
  const networkResponse = await fetchPromise;
  if (networkResponse) return networkResponse;

  // Both failed — serve offline page
  const offline = await caches.match('/offline.html');
  return offline || new Response('You are offline.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isImage(pathname) {
  return /\.(jpg|jpeg|png|gif|webp|avif|svg)$/i.test(pathname);
}

function isStaticAsset(pathname) {
  return /\.(js|css|woff2?|ttf|ico|json)$/i.test(pathname) ||
    pathname.startsWith('/icons/') ||
    pathname === '/manifest.json';
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)));
  }
}
