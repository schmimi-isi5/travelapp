// Pixabay client (official API, https://pixabay.com/api/docs/). Stock photos under the Pixabay Content License (free use, no
// attribution required, modification allowed). The API key comes from the environment and is never printed or stored.
// Pixabay offers no coordinates: every hit may only serve as a regional motif and must name the place in its tags.
// Rules of the API: at most 100 requests per minute, no permanent hotlinking (we copy files into our own storage).
const API = 'https://pixabay.com/api/';
const LARGE_WIDTH = 1280; // largeImageURL is delivered at 1280 px; the real size decides the role (no upscaled hero images)
export const PIXABAY_LICENSE = { type: 'Pixabay Content License', licenseUrl: 'https://pixabay.com/service/license-summary/' };
const AI_GENERATED = /\bai[ -]?generated\b|\bki[ -]?generiert|\bgenerative\b|\bmidjourney\b|\bstable diffusion\b/i;

export function createPixabayClient({ apiKey, userAgent, fetchImpl = fetch, delayMs = 1000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!apiKey) throw new Error('Pixabay-Schlüssel fehlt');
  let last = 0;
  async function throttled(url, parse) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const wait = last + delayMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent } });
      if (res.status === 429 || res.status >= 500) {
        await sleep(5000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new Error(`Pixabay ${res.status}`); // the URL carries the key, so it is never part of the message
      return parse(res);
    }
    throw new Error('Pixabay: giving up after retries');
  }
  return {
    /** Photos for a query in the shape of the Commons client; licence and source are fixed per provider. */
    async search(query, limit = 20) {
      const params = new URLSearchParams({
        key: apiKey, q: query.slice(0, 100), image_type: 'photo', orientation: 'horizontal', min_width: '1200', safesearch: 'true', order: 'popular', per_page: String(Math.min(200, Math.max(3, limit))),
      });
      const json = await throttled(`${API}?${params}`, (r) => r.json());
      return (json.hits ?? [])
        .filter((h) => h.largeImageURL && h.type === 'photo' && !AI_GENERATED.test(h.tags ?? ''))
        .map((h) => ({
          id: `pixabay-${h.id}`, title: `Pixabay ${h.id} ${h.tags}.jpg`, width: Math.min(h.imageWidth, LARGE_WIDTH), height: Math.round(h.imageHeight * Math.min(1, LARGE_WIDTH / h.imageWidth)), mime: 'image/jpeg', thumbUrl: h.largeImageURL, url: h.largeImageURL, pageUrl: h.pageURL,
          meta: {}, categories: String(h.tags ?? '').replace(/,\s*/g, '|'), description: '', coords: null,
          provider: 'pixabay', providerLabel: 'Pixabay', licence: { ok: true, ...PIXABAY_LICENSE, photographer: h.user || null, attributionRequired: false },
          popularity: Math.min(5, Math.round(Math.log10(1 + (h.likes ?? 0) + (h.downloads ?? 0) / 10))),
        }));
    },
    async download(url) {
      return throttled(url, async (r) => Buffer.from(await r.arrayBuffer()));
    },
  };
}
