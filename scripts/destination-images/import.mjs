#!/usr/bin/env node
// Imports licensed destination photographs for the stops of a trip into the library (storage + table destination_images).
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/destination-images/import.mjs [--trip <id>] [--dry-run] [--force] [--report <file>]
// Runs server-side only (service role). Never prints keys. Safe to repeat: complete places are skipped.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createCommonsClient } from './commons.mjs';
import { makeVariants } from './makeVariants.mjs';
import { runImport } from './pipeline.mjs';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : undefined);
const need = (key) => process.env[key] ?? (() => { throw new Error(`${key} fehlt`); })();

const admin = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const tripId = option('--trip');
let query = admin.from('trip_stops').select('id, trip_id, title, country, latitude, longitude, highlights, sequence').order('sequence');
if (tripId) query = query.eq('trip_id', tripId);
const { data: stops, error } = await query;
if (error) throw new Error(`Stationen lesen: ${error.message}`);
const log = (level, message) => console.error(`[${level}] ${message}`);
const commons = createCommonsClient({ userAgent: 'NamibiaBotswanaTravelApp/1.0 (private family trip app; contact via repository owner)' });

const reports = await runImport({ stops: stops ?? [], admin, commons, makeVariants, log, force: flag('--force'), dryRun: flag('--dry-run'), allCountries: flag('--all-countries') });
const summary = reports.map((r) => `${r.label.padEnd(16)} ${r.status.padEnd(16)} ${r.selected.map((s) => `${s.role}${s.locationVerified ? '' : '~'}`).join(' ') || '-'}  (Kandidaten ${r.candidates})`);
console.log(summary.join('\n'));
const file = option('--report');
if (file) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), places: reports }, null, 2));
  console.log(`Bericht: ${file}`);
}
