/**
 * Dash⁵ Service Worker
 * Strategy:
 *   - JS/CSS (hashed filenames) → Cache-first, fill on miss
 *   - Google Fonts              → Cache-first, fill on miss
 *   - HTML / navigation         → Network-first, serve stale on offline
 *   - /api/*                    → Network-only (never cache)
 */

const STATIC_CACHE = 'dash5-static-v1';
const PAGE_CACHE   = 'dash5-pages-v1';
const OLD_CACHES   = []; // add previous version names here when bumping version

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => OLD_CACHES.includes(k))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and API calls — always hit network
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  // Hashed static assets (JS, CSS) and fonts — Cache-first
  if (
    url.pathname.match(/\.(js|css|woff2?)$/) ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        // Clone synchronously before any async work or returning the response
        if (response.ok) {
          const clone = response.clone();
          cache.put(request, clone).catch(() => {});
        }
        return response;
      })
    );
    return;
  }

  // HTML / navigation — Network-first, fallback to cache for offline
  event.respondWith(
    fetch(request)
      .then(response => {
        // Clone synchronously here — before caches.open (async) consumes response
        if (response.ok) {
          const clone = response.clone();
          caches.open(PAGE_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
