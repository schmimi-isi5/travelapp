/* Offline shell cache. Strategy: precache every app page together with the scripts/styles it references, network-first for
   pages (fresh when online), cache-first for static assets. User data lives in IndexedDB, never in these caches, so the
   cache contains no personal data and survives sign-out without leaking anything.
   Dynamic pages (e.g. /route/<id>) are cached when first visited. */
const VERSION = 'nb-shell-v2';
const PAGES = ['/', '/route', '/stays', '/bookings', '/journal', '/journal/new', '/gallery', '/guide', '/sightings', '/expenses', '/safety', '/family', '/archive', '/offline', '/settings', '/more', '/login'];
const STATIC = ['/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];
// Route groups such as "(main)" put parentheses into chunk paths, so ")" must stay allowed.
const ASSET_PATTERN = /\/_next\/static\/[^"'\\\s<>]+\.(?:js|css)/g;

async function precachePage(cache, url) {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok || response.redirected) return; // redirects (e.g. to /login) are not shell pages
  await cache.put(url, response.clone());
  const assets = new Set((await response.text()).match(ASSET_PATTERN) ?? []);
  await Promise.allSettled([...assets].map((asset) => cache.match(asset).then((hit) => hit || cache.add(asset))));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.allSettled([...PAGES.map((p) => precachePage(cache, p)), ...STATIC.map((s) => cache.add(s))]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  const isStatic = url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
  if (isStatic) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(request, copy)); return res; })));
    return;
  }
  event.respondWith(
    fetch(request)
      .then((res) => { if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(request, copy)); } return res; })
      .catch(() => caches.match(request).then((hit) => hit || caches.match(url.pathname) || caches.match('/'))),
  );
});
