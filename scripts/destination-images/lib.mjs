// Pure helpers of the destination-image import: place derivation, licence classification, candidate scoring and
// variant planning. No network, no database: everything here is unit-tested (tests/unit/destination-images-lib.test.ts).

export const TRAVEL_REGION = new Set(['Namibia', 'Botswana']);
const COUNTRY_EN = { Namibia: 'Namibia', Botswana: 'Botswana', Deutschland: 'Germany' };

// German generic words are dropped from the place name and translated for the English search terms.
const GENERIC_WORDS = new Map([
  ['wüste', 'desert'], ['gebirge', 'mountains'], ['nationalpark', 'national park'], ['ocean', ''], ['delta', 'delta'],
  ['süd', ''], ['ost', ''], ['nord', ''], ['west', ''], ['camp', ''], ['lodge', ''], ['campsite', ''],
]);
const LARGE_AREA = /nationalpark|national park|gebirge|mountains|wüste|desert|delta|pan|etosha|chobe|okavango/i;
const ACTIVITY_WORDS = /^(relaxen|entspannung|fahrt|besuch|abholung|einkauf|stopps?|programm|boat|cruise|tour|pool|scenic|sundowner|bushwalk|u\.u\.|downtown|abendessen|offen|essen)\b/i;

export function stripDiacritics(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
}

export function slugify(text) {
  return stripDiacritics(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** "Namib Wüste / Sossusvlei" -> primary "Sossusvlei"; "Etosha Nationalpark (Süd)" -> "Etosha"; "Swakopmund Ocean" -> "Swakopmund". */
export function placeFromStop(stop) {
  const parts = String(stop.title).split('/').map((p) => p.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const clean = (name) =>
    name
      .split(' ')
      .filter((word) => !GENERIC_WORDS.has(word.toLowerCase()) || /^(delta)$/i.test(word))
      .join(' ')
      .trim();
  const cleaned = parts.map(clean).filter(Boolean);
  const primary = cleaned[cleaned.length - 1] ?? parts[parts.length - 1];
  const english = (name) =>
    name
      .split(' ')
      .map((word) => (GENERIC_WORDS.has(word.toLowerCase()) ? GENERIC_WORDS.get(word.toLowerCase()) : word))
      .filter(Boolean)
      .join(' ');
  const country = COUNTRY_EN[stop.country] ?? stop.country;
  const extras = parts.slice(0, -1).map(english).filter((e) => e && slugify(e) !== slugify(primary));
  const queries = [...new Set([`${primary} ${country}`, `${primary} landscape`, `${primary} ${country} nature`, ...extras.map((e) => `${e} ${country}`)])];
  return {
    key: slugify(primary),
    label: primary,
    country: stop.country,
    latitude: stop.latitude ?? null,
    longitude: stop.longitude ?? null,
    radiusKm: LARGE_AREA.test(stop.title) ? 100 : 30,
    queries,
  };
}

/** Named sights from a stop's highlights ("Popa Falls (N.P.) + Bwabwata (N.P.)"): extra gallery search terms, never invented. */
export function highlightQueries(stop, countryEnglish) {
  const out = [];
  for (const highlight of stop.highlights ?? []) {
    for (const raw of String(highlight).split('+')) {
      const text = raw.replace(/\([^)]*\)/g, ' ').replace(/[?]/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length < 4 || text.length > 40 || ACTIVITY_WORDS.test(text)) continue;
      const words = text.split(' ');
      if (words.length > 4 || !words.every((w) => /^[A-ZÄÖÜ]/.test(w))) continue;
      out.push(`${text} ${countryEnglish}`);
    }
  }
  return [...new Set(out)];
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** The only location proof we accept is a coordinate stored with the file within the place's radius. */
export function checkLocation(place, fileCoords) {
  if (!fileCoords || place.latitude == null || place.longitude == null) return { verified: false, basis: 'none', distanceKm: null };
  const distanceKm = haversineKm(place.latitude, place.longitude, fileCoords.lat, fileCoords.lon);
  return distanceKm <= place.radiusKm ? { verified: true, basis: `file_coordinates_within_${place.radiusKm}km`, distanceKm } : { verified: false, basis: 'file_coordinates_too_far', distanceKm };
}

export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Licence gate. Only licences that allow free reuse, copying to our own storage and resizing are accepted. A licence name alone
 * is not enough: the author must be known when the licence requires attribution, and the file must not carry restrictions.
 */
export function classifyLicense(meta) {
  const shortName = stripHtml(meta.LicenseShortName?.value ?? '');
  const restrictions = stripHtml(meta.Restrictions?.value ?? '');
  const artist = stripHtml(meta.Artist?.value ?? '');
  const licenseUrl = stripHtml(meta.LicenseUrl?.value ?? '') || null;
  if (!shortName) return { ok: false, reason: 'no_license_name' };
  if (/\b(NC|ND)\b|noncommercial|no derivatives|GFDL|fair use|copyrighted|all rights reserved|unknown/i.test(shortName)) return { ok: false, reason: `license_not_allowed:${shortName}` };
  const isPublicDomain = /^(CC0|Public domain|PDM|PD\b)/i.test(shortName);
  const isCcBy = /^CC BY(-SA)? \d\.\d/i.test(shortName);
  if (!isPublicDomain && !isCcBy) return { ok: false, reason: `license_not_recognised:${shortName}` };
  if (restrictions) return { ok: false, reason: 'file_has_restrictions' };
  if (isCcBy && (!artist || /^(unknown|anonymous|own work)$/i.test(artist))) return { ok: false, reason: 'attribution_author_missing' };
  return { ok: true, type: shortName, licenseUrl, photographer: artist || null, attributionRequired: isCcBy };
}

const EXCLUDED_CATEGORY = /\b(maps?|diagrams?|logos?|flags?|coats? of arms|portraits?|people|persons?|women|men|children|selfies?|tourists?|stamps?|banknotes?|coins?|paintings?|drawings?|illustrations?|screenshots?|posters?|advertisements?)\b/i;
const EXCLUDED_TITLE = /\b(map|karte|logo|flag|coat of arms|diagram|panoramic?|collage|montage|stitch|screenshot|poster)\b/i;

export function isUsableCandidate(candidate) {
  if (EXCLUDED_TITLE.test(candidate.title)) return { ok: false, reason: 'title_excluded' };
  const categories = String(candidate.categories ?? '').split('|');
  if (categories.some((c) => EXCLUDED_CATEGORY.test(c))) return { ok: false, reason: 'category_excluded' };
  if (!/\.(jpe?g|png|webp)$/i.test(candidate.title)) return { ok: false, reason: 'format_not_supported' };
  return { ok: true };
}

export const ROLE_REQUIREMENTS = {
  hero: { minWidth: 1920, minRatio: 1.4, maxRatio: 2.2 },
  card: { minWidth: 1200, minRatio: 1.2, maxRatio: 2.2 },
  gallery: { minWidth: 1200, minRatio: 1.0, maxRatio: 2.4 },
};

export function fitsRole(role, width, height) {
  const r = ROLE_REQUIREMENTS[role];
  const ratio = width / height;
  return width >= r.minWidth && ratio >= r.minRatio && ratio <= r.maxRatio;
}

const SCENIC = /landscape|landschaft|dune|düne|sunrise|sunset|river|fluss|delta|elephant|elefant|lion|löwe|giraffe|zebra|savanna|savannah|waterhole|national park|nationalpark|falls|view|blick|desert|wüste|mountain|berg|beach|coast|küste|vlei|\bpan\b|sand|horizon|herd/i;
const POOR_SUBJECT = /airport|flughafen|bridge|brücke|station|bahnhof|church|kirche|iglesia|buchhandlung|bookshop|kaserne|barracks|building|gebäude|hotel|street|strasse|road|supermarket|shop|store|sign|schild|\bcar\b|\bbus\b|truck|school|hospital|stamp|cemetery|friedhof|panoramio|flickr/i;
const MACRO = /mineral|crystal|quartz|tourmaline|feldspar|granite|aquamarine|akwamaryna|beryl|specimen|flower|blüte|insect|beetle|spider|butterfly|caterpillar|fungus|lichen|abutilon/i;
const SMALL_FAUNA = /kingfisher|roller|weaver|plover|hoopoe|oxpecker|bee-eater|swallow|dove|sparrow|heron|\bbird|starling|shrike|hornbill|lapwing|stork/i;
const LATIN_BINOMIAL = /\(([A-Z][a-z]+ [a-z]+)( [a-z]+)?\)/;

/** What the picture shows, judged from its title only: landscapes and big wildlife up, buildings, close-ups and minerals down. */
export function subjectScore(role, title) {
  let score = 0;
  if (SCENIC.test(title)) score += 12;
  if (POOR_SUBJECT.test(title)) score -= role === 'gallery' ? 6 : 20;
  if (MACRO.test(title)) score -= role === 'gallery' ? 15 : 40;
  if (LATIN_BINOMIAL.test(title)) score -= role === 'hero' ? 18 : role === 'card' ? 10 : 0;
  if (SMALL_FAUNA.test(title)) score -= role === 'hero' ? 14 : role === 'card' ? 8 : 0;
  return score;
}

/** Transparent ranking: quality (0-45), location evidence (0-35), role fit (0-15), subject (-40..+12), featured bonus (0-10), reuse penalty. */
export function scoreCandidate(role, candidate, location, { reused = false } = {}) {
  const megapixels = (candidate.width * candidate.height) / 1e6;
  const quality = Math.min(45, 15 + megapixels * 3);
  const locationScore = location.verified ? 35 : location.basis === 'file_coordinates_too_far' ? 0 : 8;
  const ratio = candidate.width / candidate.height;
  const roleFit = role === 'hero' ? (ratio >= 1.5 && ratio <= 1.9 ? 15 : 8) : role === 'card' ? (ratio >= 1.25 && ratio <= 1.7 ? 15 : 8) : 10;
  const bonus = /featured|quality images?|valued images?/i.test(String(candidate.categories ?? '')) ? (role === 'gallery' ? 5 : 10) : 0;
  const reuse = reused ? -25 : 0; // the same photo should not dominate neighbouring places
  return Math.round((quality + locationScore + roleFit + subjectScore(role, candidate.title) + bonus + reuse) * 100) / 100;
}

/** Variant plan per role: target size, crop and the key under which the path is stored. */
export const VARIANT_PLAN = {
  hero: [
    { key: 'desktop', width: 1920, height: 1080, quality: 76 },
    { key: 'tablet', width: 1200, height: 800, quality: 74 },
    { key: 'mobile', width: 800, height: 700, quality: 72 },
  ],
  card: [
    { key: 'card', width: 800, height: 600, quality: 74 },
    { key: 'thumb', width: 320, height: 240, quality: 70 },
  ],
  gallery: [
    { key: 'full', width: 1200, height: null, quality: 74 },
    { key: 'thumb', width: 320, height: 240, quality: 70 },
  ],
};

export function altTextFor(place, role, candidate) {
  const description = stripHtml(candidate.description ?? '');
  const base = description && description.length <= 140 ? description : `${place.label}, ${place.country}`;
  return role === 'hero' || role === 'card' ? base : `${base} (Galeriebild)`;
}

/**
 * Picks the missing roles from scored candidates without using one file twice per place.
 * `needs` says how many images each role still lacks, e.g. { hero: 1, card: 1, gallery: 3 }.
 */
/** Below these scores a role stays empty and the app shows its illustration instead of a poor or doubtful photo. */
export const MIN_SCORE = { hero: 55, card: 45, gallery: 35 };

export function chooseRoles(scored, needs = { hero: 1, card: 1, gallery: 3 }) {
  const used = new Set();
  const take = (role, count) => {
    const picks = [];
    if (count <= 0) return picks;
    for (const item of scored.filter((s) => fitsRole(role, s.width, s.height) && s.scores[role] >= MIN_SCORE[role]).sort((a, b) => b.scores[role] - a.scores[role])) {
      if (used.has(item.id)) continue;
      used.add(item.id);
      picks.push({ role, item });
      if (picks.length === count) break;
    }
    return picks;
  };
  return [...take('hero', needs.hero ?? 0), ...take('card', needs.card ?? 0), ...take('gallery', needs.gallery ?? 0)];
}

/** A file without coordinates may only serve as a regional motif, and only if its title or categories name the place. */
export function namesPlace(place, candidate) {
  const haystack = slugify(`${candidate.title} ${candidate.categories ?? ''}`);
  return slugify(place.label)
    .split('-')
    .filter((token) => token.length > 3)
    .some((token) => haystack.includes(token));
}
