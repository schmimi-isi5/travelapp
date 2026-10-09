#!/usr/bin/env node
// Generates docker/stack.secrets (gitignored) for the local/self-hosted Supabase stack.
// Usage: node scripts/gen-secrets.mjs [--force] [--site-url URL] [--api-url URL] [--out FILE]
// Never prints secret values, only the file path and variable names. Node built-ins only.
import { randomBytes, createHmac } from 'node:crypto';
import { existsSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const outFile = resolve(option('--out', resolve(root, 'docker/stack.secrets')));
const siteUrl = option('--site-url', 'http://localhost:18080');
const apiUrl = option('--api-url', 'http://localhost:18000');

if (existsSync(outFile) && !flag('--force')) {
  console.error(`Refusing to overwrite ${outFile} (use --force; this invalidates existing sessions, keys and the DB password).`);
  process.exit(1);
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function signHs256Jwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

const jwtSecret = b64url(randomBytes(48));
const issuedAt = Math.floor(Date.now() / 1000);
const tenYears = 10 * 365 * 24 * 3600;
const roleToken = (role) => signHs256Jwt({ role, iss: 'supabase', iat: issuedAt, exp: issuedAt + tenYears }, jwtSecret);
const anonKey = roleToken('anon');
const serviceRoleKey = roleToken('service_role');

const values = {
  POSTGRES_PASSWORD: b64url(randomBytes(24)),
  JWT_SECRET: jwtSecret,
  ANON_KEY: anonKey,
  SERVICE_ROLE_KEY: serviceRoleKey,
  API_EXTERNAL_URL: apiUrl,
  SITE_URL: siteUrl,
  CORS_ORIGIN: siteUrl,
  NEXT_PUBLIC_SUPABASE_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  SUPABASE_INTERNAL_URL: 'http://kong:8000',
  NEXT_PUBLIC_SITE_URL: siteUrl,
  NEXT_PUBLIC_APP_MODE: 'supabase',
  AI_PROVIDER: 'disabled',
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
chmodSync(outFile, 0o600);

console.log(`Wrote ${outFile} (mode 0600). Variables: ${Object.keys(values).join(', ')}`);
