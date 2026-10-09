import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { setActor } from '@/lib/db/actor';
import { resetDatabasesForTests } from '@/lib/db/local';
import type { Role } from '@/lib/domain/schemas';
import { SupabaseRemote } from '@/lib/offline/remote-supabase';
import { setSimulatedOffline } from '@/lib/offline/network';

/** Reads docker/stack.secrets (KEY=VALUE) unless the values are provided through the environment. */
function loadSecrets(): Record<string, string> {
  const file = join(process.cwd(), 'docker', 'stack.secrets');
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

const secrets = loadSecrets();
export const config = {
  url: process.env.SUPABASE_TEST_URL ?? 'http://localhost:18000',
  anonKey: process.env.SUPABASE_TEST_ANON_KEY ?? secrets.ANON_KEY ?? '',
  serviceKey: process.env.SUPABASE_TEST_SERVICE_KEY ?? secrets.SERVICE_ROLE_KEY ?? '',
};

// The app's server routes read their configuration from the environment.
process.env.NEXT_PUBLIC_SUPABASE_URL = config.url;
process.env.SUPABASE_INTERNAL_URL = config.url;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = config.anonKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = config.serviceKey;

export async function backendAvailable(): Promise<boolean> {
  if (!config.anonKey || !config.serviceKey) return false;
  try {
    const res = await fetch(`${config.url}/auth/v1/health`, { headers: { apikey: config.anonKey }, signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
export const admin: SupabaseClient = createClient(config.url, config.serviceKey || 'missing', opts);
export const anon: SupabaseClient = createClient(config.url, config.anonKey || 'missing', opts);

export const PASSWORD = 'correct-horse-battery-1';

export function uniq(): string {
  return randomBytes(4).toString('hex');
}

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
  accessToken: string;
}

const createdUsers: string[] = [];

export async function createUser(label: string): Promise<TestUser> {
  const email = `${label}.${uniq()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  createdUsers.push(data.user.id);
  return signIn(email);
}

export async function signIn(email: string, password = PASSWORD): Promise<TestUser> {
  const client = createClient(config.url, config.anonKey, opts);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signIn: ${error?.message}`);
  return { id: data.user.id, email, client, accessToken: data.session.access_token };
}

export async function deleteCreatedUsers(): Promise<void> {
  for (const id of createdUsers.splice(0)) await admin.auth.admin.deleteUser(id).catch(() => undefined);
}

export interface TestFamily {
  id: string;
  tripId: string;
  owner: TestUser;
}

export async function createFamily(owner: TestUser, name = 'Testfamilie'): Promise<TestFamily> {
  const { data: id, error } = await owner.client.rpc('create_family', { family_name: `${name} ${uniq()}` });
  if (error) throw new Error(`create_family: ${error.message}`);
  const { data: trip, error: tripError } = await owner.client.from('trips').insert({ family_id: id, title: 'Namibia & Botswana', start_date: '2026-10-13', countries: ['Namibia', 'Botswana'] }).select('id').single();
  if (tripError) throw new Error(`trip: ${tripError.message}`);
  return { id: String(id), tripId: String((trip as { id: string }).id), owner };
}

export async function sha256(text: string): Promise<string> {
  const { sha256Hex } = await import('@/lib/auth/token');
  return sha256Hex(text);
}

/** Owner creates an invitation row; the invited user (already registered) accepts it with the raw token. */
export async function joinFamily(family: TestFamily, user: TestUser, role: Exclude<Role, 'owner'>): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const { error } = await family.owner.client.from('invitations').insert({
    family_id: family.id,
    email: user.email,
    role,
    token_hash: await sha256(token),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  });
  if (error) throw new Error(`invite: ${error.message}`);
  const accepted = await user.client.rpc('accept_invitation', { raw_token: token });
  if (accepted.error) throw new Error(`accept: ${accepted.error.message}`);
}

export interface TestMember extends TestUser {
  role: Role;
}

/** Owner plus one user for each other role, all in one family. */
export async function createFamilyWithRoles(): Promise<{ family: TestFamily; owner: TestMember; adult: TestMember; member: TestMember; child: TestMember }> {
  const owner = await createUser('owner');
  const family = await createFamily(owner);
  const make = async (role: Exclude<Role, 'owner'>): Promise<TestMember> => {
    const user = await createUser(role);
    await joinFamily(family, user, role);
    return { ...user, role };
  };
  return { family, owner: { ...owner, role: 'owner' }, adult: await make('adult'), member: await make('member'), child: await make('child') };
}

export function remoteFor(user: TestUser & { role?: Role }, familyId: string, role: Role): SupabaseRemote {
  return new SupabaseRemote(user.client, { familyId, userId: user.id, deviceId: `dev-${uniq()}`, isAdult: () => role === 'owner' || role === 'adult' });
}

/** Activates a fresh local IndexedDB (a "device") acting as the given user. */
export function useDevice(user: { id: string }, role: Role): void {
  resetDatabasesForTests(`${randomUUID().slice(0, 8)}`);
  setSimulatedOffline(false);
  setActor({ userId: user.id, role });
}
