// Reproducible import: stops -> places -> candidates (Commons) -> licence/location gate -> ranking -> optimised variants ->
// storage + library rows -> report. Idempotent: existing roles are not refilled and known files are not downloaded again.
import { createHash } from 'node:crypto';
import { altTextFor, chooseRoles, checkLocation, classifyLicense, highlightQueries, isUsableCandidate, namesPlace, placeFromStop, regionMotifFits, scoreCandidate, TRAVEL_REGION, VARIANT_PLAN, stripHtml } from './lib.mjs';

export const BUCKET = 'destination-media';
export const GALLERY_TARGET = 10;

/** Groups stops by place key; stops outside the travel region (e.g. the departure airport) are skipped, stops without a title too. */
export function placesFromStops(stops, { allCountries = false } = {}) {
  const places = new Map();
  for (const stop of stops) {
    if (!allCountries && !TRAVEL_REGION.has(stop.country)) continue;
    const place = placeFromStop(stop);
    if (!place?.key) continue;
    const countryEn = place.country === 'Botswana' ? 'Botswana' : place.country;
    const extra = highlightQueries(stop, countryEn);
    const known = places.get(place.key);
    if (known) {
      known.queries = [...new Set([...known.queries, ...place.queries])];
      known.highlightQueries = [...new Set([...known.highlightQueries, ...extra])];
      known.stopIds.push(stop.id);
    } else {
      places.set(place.key, { ...place, highlightQueries: extra, stopIds: [stop.id] });
    }
  }
  return [...places.values()];
}

function emptyReport(place) {
  return { place: place.key, label: place.label, queries: [], candidates: 0, rejected: {}, selected: [], status: 'pending', missing: [] };
}
const bump = (counter, reason) => {
  counter[reason] = (counter[reason] ?? 0) + 1;
};

export async function importPlace({ place, admin, commons, pixabay = null, makeVariants, log, force = false, dryRun = false, usedSources = new Set(), galleryTarget = GALLERY_TARGET }) {
  const report = emptyReport(place);
  const { data: existing, error } = await admin.from('destination_images').select('role, source_id, content_hash, approved').eq('place_key', place.key);
  if (error) throw new Error(`library lookup ${place.key}: ${error.message}`);
  const have = { hero: 0, card: 0, gallery: 0 };
  for (const row of existing ?? []) if (row.approved) have[row.role] += 1;
  const needs = { hero: Math.max(0, 1 - have.hero), card: Math.max(0, 1 - have.card), gallery: Math.max(0, galleryTarget - have.gallery) };
  if (!force && needs.hero + needs.card + needs.gallery === 0) return { ...report, status: 'complete_skipped' };

  const knownSources = new Set((existing ?? []).map((r) => r.source_id));
  const queries = [...place.queries.slice(0, 3), ...place.highlightQueries.slice(0, 3)];
  report.queries = queries;
  const byId = new Map();
  for (const query of queries) {
    try {
      for (const c of await commons.search(query, 20)) if (!byId.has(c.id)) byId.set(c.id, { ...c, client: commons });
    } catch (cause) {
      log('warn', `search failed (${query}): ${cause.message}`);
      bump(report.rejected, 'search_error');
    }
  }
  if (pixabay) {
    // stock photos: the place name must be in the query and later in the tags (see namesPlace)
    const country = place.country === 'Botswana' ? 'Botswana' : 'Namibia';
    for (const query of [place.queries[0], ...place.queries.slice(1, 3), ...place.highlightQueries.slice(0, 2), `${country} landscape`, `${country} sunset`, `${country} safari wildlife`, `${country} nature`].filter(Boolean)) {
      try {
        for (const c of await pixabay.search(query, 40)) if (!byId.has(c.id)) byId.set(c.id, { ...c, client: pixabay });
      } catch (cause) {
        log('warn', `pixabay search failed (${query}): ${cause.message}`);
        bump(report.rejected, 'search_error');
      }
    }
  }
  report.candidates = byId.size;

  const scored = [];
  for (const c of byId.values()) {
    if (knownSources.has(c.title)) { bump(report.rejected, 'already_in_library'); continue; }
    const usable = isUsableCandidate(c);
    if (!usable.ok) { bump(report.rejected, usable.reason); continue; }
    const licence = c.licence ?? classifyLicense(c.meta);
    if (!licence.ok) { bump(report.rejected, licence.reason.split(':')[0]); continue; }
    const location = checkLocation(place, c.coords);
    if (location.basis === 'file_coordinates_too_far') { bump(report.rejected, 'location_mismatch'); continue; }
    const namesThePlace = namesPlace(place, c);
    const isCountryMotif = !location.verified && !namesThePlace && c.provider === 'pixabay' && regionMotifFits(place, c);
    if (!location.verified && !namesThePlace && !isCountryMotif) { bump(report.rejected, 'no_place_evidence'); continue; }
    const loc = location.verified ? location : { verified: false, basis: namesThePlace ? 'title_or_category_names_place' : 'country_tag_plausible_motif', distanceKm: null };
    scored.push({ ...c, licence, location: loc, scores: ['hero', 'card', 'gallery'].reduce((acc, role) => ({ ...acc, [role]: scoreCandidate(role, c, loc, { reused: usedSources.has(c.title) }) + (c.popularity ?? 0) }), {}) });
  }

  const picks = chooseRoles(scored, needs);
  const missing = Object.entries(needs).filter(([role, n]) => picks.filter((p) => p.role === role).length < n).map(([role]) => role);
  report.missing = missing;

  for (const { role, item } of picks) {
    const entry = { role, file: item.title, license: item.licence.type, photographer: item.licence.photographer, locationVerified: item.location.verified, locationBasis: item.location.basis, score: item.scores[role], sourceUrl: item.pageUrl };
    if (dryRun) { report.selected.push({ ...entry, stored: false }); continue; }
    try {
      const bytes = await item.client.download(item.thumbUrl);
      const hash = createHash('sha256').update(bytes).digest('hex');
      if ((existing ?? []).some((r) => r.role === role && r.content_hash === hash)) { bump(report.rejected, 'duplicate_content'); continue; }
      const variants = await makeVariants(bytes, VARIANT_PLAN[role]);
      const paths = {};
      for (const v of variants) {
        const path = `${place.key}/${hash.slice(0, 12)}-${role}-${v.key}.webp`;
        const up = await admin.storage.from(BUCKET).upload(path, v.buffer, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' });
        if (up.error && !/already exists|Duplicate/i.test(up.error.message)) throw new Error(`upload ${path}: ${up.error.message}`);
        paths[v.key] = path;
      }
      const largest = variants[0];
      const attribution = `${item.licence.photographer ?? 'Unbekannt'} / ${item.providerLabel ?? 'Wikimedia Commons'} / ${item.licence.type}${item.licence.attributionRequired ? ' (verkleinert und zugeschnitten)' : ''}`;
      const row = {
        place_key: place.key, place_label: place.label, country: place.country, latitude: place.latitude, longitude: place.longitude, radius_km: place.radiusKm, role, variants: paths,
        width: largest.width, height: largest.height, alt_text: altTextFor(place, role, item), source_provider: item.provider ?? 'wikimedia_commons', source_id: item.title, source_url: item.pageUrl,
        photographer: item.licence.photographer, license_type: item.licence.type, license_url: item.licence.licenseUrl, attribution_text: attribution, attribution_required: item.licence.attributionRequired,
        license_verified: true, location_verified: item.location.verified, location_basis: item.location.basis, score: item.scores[role], content_hash: hash,
        review_note: item.location.verified ? `Koordinaten der Datei liegen ${Math.round(item.location.distanceKm)} km vom Ort entfernt.` : item.location.basis === 'country_tag_plausible_motif' ? 'Stockfoto ohne Ortsangabe, nur das Land ist getaggt und das Motiv passt zur Gegend: Regionsmotiv, kein Beleg für genau diesen Ort.' : 'Ortszuordnung nicht durch Koordinaten belegt (Titel/Kategorie nennt den Ort): als Regionsmotiv kennzeichnen.',
        approved: true,
      };
      const ins = await admin.from('destination_images').upsert(row, { onConflict: 'place_key,role,content_hash', ignoreDuplicates: true });
      if (ins.error) throw new Error(`insert ${place.key}/${role}: ${ins.error.message}`);
      report.selected.push({ ...entry, stored: true });
    } catch (cause) {
      log('error', `${place.key}/${role} (${item.title}): ${cause.message}`);
      bump(report.rejected, 'import_error');
    }
  }
  report.status = report.selected.length === 0 ? 'no_images' : missing.length ? 'partial' : 'complete';
  return report;
}

export async function runImport(options) {
  const { stops, log = () => undefined, ...rest } = options;
  const places = placesFromStops(stops, { allCountries: Boolean(rest.allCountries) });
  const reports = [];
  const usedSources = new Set();
  for (const place of places) {
    log('info', `place ${place.key}`);
    const report = await importPlace({ place, log, usedSources, ...rest });
    for (const s of report.selected) usedSources.add(s.file);
    reports.push(report);
  }
  return reports;
}

export { stripHtml };
