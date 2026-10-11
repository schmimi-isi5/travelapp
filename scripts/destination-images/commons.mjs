// Wikimedia Commons client (official MediaWiki API, https://commons.wikimedia.org/w/api.php). Sequential, throttled, with a
// descriptive User-Agent as required by the Wikimedia API etiquette; retries 429 and 5xx with backoff.
const API = 'https://commons.wikimedia.org/w/api.php';
const META_KEYS = 'LicenseShortName|LicenseUrl|Artist|Credit|UsageTerms|Restrictions|Categories|ImageDescription|AttributionRequired|ObjectName';

export function createCommonsClient({ userAgent, fetchImpl = fetch, delayMs = 1600, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let last = 0;
  async function throttled(url, parse) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const wait = last + delayMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent } });
      if (res.status === 429 || res.status >= 500) {
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new Error(`Commons ${res.status} for ${url.slice(0, 120)}`);
      return parse(res);
    }
    throw new Error(`Commons: giving up after retries for ${url.slice(0, 120)}`);
  }
  return {
    /** Files matching a query with size, thumbnail URL, licence metadata and (primary) coordinates. */
    async search(query, limit = 20) {
      const params = new URLSearchParams({
        action: 'query', format: 'json', formatversion: '2', generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: String(limit),
        prop: 'imageinfo|coordinates', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '2560', iiextmetadatafilter: META_KEYS, coprop: 'type|dim', coprimary: 'primary', colimit: String(limit),
      });
      const json = await throttled(`${API}?${params}`, (r) => r.json());
      return (json.query?.pages ?? [])
        .filter((p) => p.imageinfo?.[0])
        .map((p) => {
          const info = p.imageinfo[0];
          const meta = info.extmetadata ?? {};
          const coord = p.coordinates?.[0];
          return {
            id: String(p.pageid), title: p.title, width: info.width, height: info.height, mime: info.mime, thumbUrl: info.thumburl ?? info.url, url: info.url, pageUrl: info.descriptionurl,
            meta, categories: meta.Categories?.value ?? '', description: meta.ImageDescription?.value ?? '', coords: coord ? { lat: coord.lat, lon: coord.lon } : null,
          };
        });
    },
    async download(url) {
      return throttled(url, async (r) => Buffer.from(await r.arrayBuffer()));
    },
  };
}
