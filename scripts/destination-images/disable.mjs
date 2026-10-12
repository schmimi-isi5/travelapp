#!/usr/bin/env node
// Takes library photos out of use (approved = false, reversible) when their motif does not fit: airports, churches, minerals,
// accommodation, photos that belong to another place. Matches rows by place key and a part of the source id (the file title).
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/destination-images/disable.mjs <plan.json> [--dry-run]
// plan.json: [{ "place": "maun", "match": "Cessna", "reason": "Flugzeug" }, …].
//   … disable.mjs --rescan [--dry-run]   checks every approved photo against the current motif rules instead of a plan.
// Never prints keys.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { isUsableCandidate, namesOtherPlace, motifPlausibleForPlace } from './lib.mjs';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const [planFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const isRescan = process.argv.includes('--rescan');
if (!planFile && !isRescan) throw new Error('Aufruf: disable.mjs <plan.json> [--dry-run] oder disable.mjs --rescan [--dry-run]');
const isDryRun = process.argv.includes('--dry-run');
const need = (key) => process.env[key] ?? (() => { throw new Error(`${key} fehlt`); })();
const admin = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
let changed = 0;

if (isRescan) {
  const { data, error } = await admin.from('destination_images').select('id, place_key, source_id, source_provider, review_note').eq('approved', true);
  if (error) throw new Error(`Bibliothek lesen: ${error.message}`);
  for (const row of data ?? []) {
    const candidate = { title: row.source_id, categories: '' };
    const place = { key: row.place_key };
    const usable = isUsableCandidate(candidate);
    const reason = !usable.ok ? `Motiv ungeeignet (${usable.reason})` : namesOtherPlace(place, candidate) ? 'Foto zeigt ein Wahrzeichen eines anderen Ortes' : row.source_provider === 'pixabay' && !motifPlausibleForPlace(place, candidate) ? 'Motiv passt nicht zum Ort' : null;
    if (!reason) continue;
    console.log(`${isDryRun ? '[Probelauf] ' : ''}${row.place_key}: ${row.source_id.slice(0, 80)} – ${reason}`);
    if (isDryRun) continue;
    const { error: updateError } = await admin.from('destination_images').update({ approved: false, review_note: `${row.review_note ?? ''} Entfernt: ${reason}.`.trim() }).eq('id', row.id);
    if (updateError) throw new Error(`${row.id}: ${updateError.message}`);
    changed += 1;
  }
  console.log(`${changed} Foto(s) außer Betrieb genommen.`);
  process.exit(0);
}

const plan = JSON.parse(readFileSync(planFile, 'utf8'));

for (const { place, match, reason } of plan) {
  const { data, error } = await admin.from('destination_images').select('id, source_id, approved, review_note').eq('place_key', place).eq('approved', true).ilike('source_id', `%${match}%`);
  if (error) throw new Error(`${place}/${match}: ${error.message}`);
  for (const row of data ?? []) {
    console.log(`${isDryRun ? '[Probelauf] ' : ''}${place}: ${row.source_id.slice(0, 80)} – ${reason}`);
    if (isDryRun) continue;
    const note = `${row.review_note ?? ''} Entfernt: ${reason}.`.trim();
    const { error: updateError } = await admin.from('destination_images').update({ approved: false, review_note: note }).eq('id', row.id);
    if (updateError) throw new Error(`${row.id}: ${updateError.message}`);
    changed += 1;
  }
}
console.log(`${changed} Foto(s) außer Betrieb genommen.`);
