#!/usr/bin/env node
// Creates the first owner account and an empty family on a fresh self-hosted stack.
// Public sign-up is disabled, so this is the only way to create the very first user.
//
//   SUPABASE_URL=https://api.reise.example SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//   BOOTSTRAP_PASSWORD='...' node scripts/bootstrap-owner.mjs --email owner@example.org --family "Familie Beispiel"
//
// The password is read from BOOTSTRAP_PASSWORD (never from argv, never printed). Existing accounts are reused when the
// password matches. Idempotent: if the user already owns a family nothing is created. Secrets are never logged.
import { createClient } from '@supabase/supabase-js';

const MIN_PASSWORD = 10;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function fail(message) {
  console.error(`bootstrap-owner: ${message}`);
  process.exit(1);
}

const url = process.env.SUPABASE_URL ?? process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.BOOTSTRAP_PASSWORD;
const email = arg('email');
const familyName = arg('family');

if (!url || !anonKey || !serviceKey) fail('SUPABASE_URL, SUPABASE_ANON_KEY und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.');
if (!email || !/^\S+@\S+\.\S+$/.test(email)) fail('--email <adresse> fehlt oder ist ungültig.');
if (!familyName?.trim()) fail('--family <name> fehlt.');
if (!password || password.length < MIN_PASSWORD) fail(`BOOTSTRAP_PASSWORD fehlt oder ist kürzer als ${MIN_PASSWORD} Zeichen.`);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, opts);
const anon = createClient(url, anonKey, opts);

const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error && created.error.code !== 'email_exists') fail(`Konto konnte nicht angelegt werden: ${created.error.message}`);
console.log(created.error ? 'Konto existiert bereits, melde an …' : 'Konto angelegt.');

const signedIn = await anon.auth.signInWithPassword({ email, password });
if (signedIn.error) fail('Anmeldung fehlgeschlagen (bei bestehendem Konto muss BOOTSTRAP_PASSWORD dem Passwort entsprechen).');

const { data: existing, error: readError } = await anon.from('family_members').select('family_id, role').eq('user_id', signedIn.data.user.id).eq('status', 'active');
if (readError) fail(`Mitgliedschaft nicht lesbar: ${readError.message}`);
if (existing?.length) {
  console.log(`Der Nutzer gehört bereits zu einer Familie (Rolle ${existing[0].role}). Nichts zu tun.`);
  process.exit(0);
}

const family = await anon.rpc('create_family', { family_name: familyName.trim() });
if (family.error) fail(`Familie konnte nicht angelegt werden: ${family.error.message}`);
console.log(`Familie angelegt (id ${family.data}). Melde dich in der App an, die Reise richtest du dort ein.`);
