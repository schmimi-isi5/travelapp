/* Offline shell cache. Strategy: precache every app page together with the scripts/styles it references, network-first for
   pages (fresh when online), cache-first for static assets. User data lives in IndexedDB, never in these caches (the saved map tiles live in their own 'nb-map-' cache, managed by the app), so the
   cache contains no personal data and survives sign-out without leaking anything.
   Dynamic pages (e.g. /route/<id>) are cached when first visited. */
const VERSION = 'nb-shell-v6';
// Library photos of the destinations: immutable, content-addressed files, kept in their own cache so that shell updates do not drop them.
const IMAGE_CACHE = 'nb-images-v1';
const IMAGE_PREFIX = '/media/destination/';
// Android "Teilen mit …": shared files wait here until the signed-in app imports them into the gallery (src/lib/share-inbox.ts).
const SHARE_PATH = '/share-target';
const SHARE_CACHE = 'nb-share-inbox';
const PAGES = ['/', '/route', '/map', '/stays', '/bookings', '/journal', '/journal/new', '/gallery', '/guide', '/sightings', '/expenses', '/safety', '/family', '/followers', '/archive', '/offline', '/settings', '/more', '/login'];
const MAP_FONT_FILES = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'].flatMap((font) => ['0-255', '256-511'].map((range) => `/map/fonts/${encodeURIComponent(font)}/${range}.pbf`));
const STATIC = ['/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/map/worker/maplibre-gl-worker.mjs', ...MAP_FONT_FILES];
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
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('nb-shell-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function receiveShare(request) {
  try {
    const form = await request.formData();
    const cache = await caches.open(SHARE_CACHE);
    const stamp = Date.now();
    let count = 0;
    for (const file of form.getAll('media')) {
      if (typeof file === 'string' || !/^(image|video|audio)\//.test(file.type)) continue;
      await cache.put(`/share-inbox/${stamp}-${String(count).padStart(3, '0')}`, new Response(file, { headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name || 'geteilt') } }));
      count += 1;
    }
    return Response.redirect(`/gallery?shared=${count}`, 303);
  } catch {
    return Response.redirect('/gallery?shared=error', 303);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname === SHARE_PATH) {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith(IMAGE_PREFIX)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) =>
        cache.match(request).then((hit) => hit || fetch(request).then((res) => { if (res.ok) cache.put(request, res.clone()); return res; })),
      ),
    );
    return;
  }
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
