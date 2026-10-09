import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, anon, backendAvailable, config, createFamily, createFamilyWithRoles, createUser, deleteCreatedUsers, PASSWORD, remoteFor, sha256, signIn, uniq } from './harness';

const available = await backendAvailable();

describe.skipIf(!available)('auth and family management (real Supabase)', () => {
  afterAll(deleteCreatedUsers);

  it('rejects public sign-up: accounts exist only through invitations or the bootstrap script', async () => {
    const { error } = await anon.auth.signUp({ email: `intruder.${uniq()}@example.test`, password: PASSWORD });
    expect(error).not.toBeNull();
  });

  it('signs in, refreshes and signs out so that the refresh token is revoked', async () => {
    const user = await createUser('login');
    expect((await user.client.auth.getUser()).data.user?.email).toBe(user.email);
    const { data } = await user.client.auth.getSession();
    const refreshToken = data.session!.refresh_token;
    await user.client.auth.signOut();
    const { error } = await anon.auth.refreshSession({ refresh_token: refreshToken });
    expect(error).not.toBeNull();
    await expect(signIn(user.email, 'wrong-password-123')).rejects.toThrow();
  });

  it('founds a family through the RPC and starts empty (no demo data)', async () => {
    const owner = await createUser('founder');
    const family = await createFamily(owner);
    const { data: members } = await owner.client.from('family_members').select('role, status').eq('family_id', family.id);
    expect(members).toEqual([{ role: 'owner', status: 'active' }]);
    for (const table of ['trip_stops', 'stays', 'bookings', 'journal_entries', 'media_assets', 'expenses']) {
      const { data, error } = await owner.client.from(table).select('id');
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
    const { data: trips } = await owner.client.from('trips').select('is_demo').eq('family_id', family.id);
    expect(trips).toEqual([{ is_demo: false }]);
  });

  describe('invitation flow through the app routes', () => {
    it('registers an invited user (server-side), then accepts the invitation; the token works once', async () => {
      const { POST } = await import('@/app/api/invitations/register/route');
      const owner = await createUser('inviter');
      const family = await createFamily(owner);
      const token = randomBytes(32).toString('base64url');
      const email = `guest.${uniq()}@example.test`;
      const { error } = await owner.client.from('invitations').insert({ family_id: family.id, email, role: 'member', token_hash: await sha256(token), expires_at: new Date(Date.now() + 3600_000).toISOString() });
      expect(error).toBeNull();

      const register = (body: unknown) => POST(new Request('http://app/api/invitations/register', { method: 'POST', headers: { 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 200)}` }, body: JSON.stringify(body) }));
      const res = await register({ token, password: PASSWORD, displayName: 'Gast' });
      expect(res.status).toBe(200);
      expect((await res.json()).email).toBe(email);

      const guest = await signIn(email);
      const accepted = await guest.client.rpc('accept_invitation', { raw_token: token });
      expect(accepted.error).toBeNull();
      expect(accepted.data).toBe(family.id);
      const { data: mine } = await guest.client.from('family_members').select('role').eq('user_id', guest.id);
      expect(mine).toEqual([{ role: 'member' }]);

      // single use
      expect((await register({ token, password: PASSWORD })).status).toBe(400);
      expect((await guest.client.rpc('accept_invitation', { raw_token: token })).error).not.toBeNull();
    });

    it('refuses registration for unknown, expired and revoked tokens with the same generic answer', async () => {
      const { POST } = await import('@/app/api/invitations/register/route');
      const owner = await createUser('inviter2');
      const family = await createFamily(owner);
      const expired = randomBytes(32).toString('base64url');
      const revoked = randomBytes(32).toString('base64url');
      const mk = async (token: string, extra: Record<string, unknown>) =>
        owner.client.from('invitations').insert({ family_id: family.id, email: `x.${uniq()}@example.test`, role: 'member', token_hash: await sha256(token), expires_at: new Date(Date.now() + 3600_000).toISOString(), ...extra });
      await mk(expired, { expires_at: new Date(Date.now() - 1000).toISOString() });
      await mk(revoked, { revoked_at: new Date().toISOString() });
      const call = (token: string) => POST(new Request('http://app/api/invitations/register', { method: 'POST', headers: { 'x-forwarded-for': `10.1.0.${Math.floor(Math.random() * 200)}` }, body: JSON.stringify({ token, password: PASSWORD }) }));
      const results = await Promise.all([call(randomBytes(32).toString('base64url')), call(expired), call(revoked)]);
      expect(results.map((r) => r.status)).toEqual([400, 400, 400]);
      const bodies = await Promise.all(results.map((r) => r.json()));
      expect(new Set(bodies.map((b) => b.error))).toEqual(new Set(['INVITATION_INVALID']));
    });

    it('does not let a different signed-in user take over an invitation addressed to someone else', async () => {
      const owner = await createUser('inviter3');
      const family = await createFamily(owner);
      const token = randomBytes(32).toString('base64url');
      await owner.client.from('invitations').insert({ family_id: family.id, email: `target.${uniq()}@example.test`, role: 'adult', token_hash: await sha256(token), expires_at: new Date(Date.now() + 3600_000).toISOString() });
      const thief = await createUser('thief');
      expect((await thief.client.rpc('accept_invitation', { raw_token: token })).error).not.toBeNull();
      const { data } = await thief.client.from('family_members').select('family_id');
      expect(data).toEqual([]);
    });

    it('rate limits repeated registration attempts from one address', async () => {
      const { POST } = await import('@/app/api/invitations/register/route');
      const statuses: number[] = [];
      for (let i = 0; i < 13; i++) {
        const res = await POST(new Request('http://app/api/invitations/register', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.9' }, body: JSON.stringify({ token: randomBytes(32).toString('base64url'), password: PASSWORD }) }));
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429, 429]);
    });
  });

  describe('roles are enforced by the database', () => {
    it('children and members read no finance, adults and owners do', async () => {
      const { family, owner, adult, member, child } = await createFamilyWithRoles();
      const stay = await owner.client.from('stays').insert({ trip_id: family.tripId, name: 'Lodge', price_minor: 100000, currency: 'NAD', quote_status: 'confirmed', booking_ref: 'REF-1' }).select('id').single();
      expect(stay.error).toBeNull();
      const stayId = (stay.data as { id: string }).id;
      await owner.client.from('payments').insert({ family_id: family.id, stay_id: stayId, amount_minor: 5000, currency: 'NAD' });
      await owner.client.from('expenses').insert({ trip_id: family.tripId, category: 'transport', amount_minor: 100, currency: 'NAD', entered_by: owner.id });
      for (const user of [adult, owner]) {
        for (const table of ['stays', 'payments', 'expenses']) expect((await user.client.from(table).select('id')).data, `${user.role}/${table}`).toHaveLength(1);
      }
      for (const user of [member, child]) {
        for (const table of ['stays', 'payments', 'expenses', 'documents', 'fx_rates', 'invitations']) expect((await user.client.from(table).select('id')).data, `${user.role}/${table}`).toEqual([]);
        const overview = await user.client.from('stays_overview').select('*');
        expect(overview.data).toHaveLength(1);
        expect(JSON.stringify(overview.data)).not.toMatch(/price|booking_ref|REF-1|100000/);
        expect((await user.client.from('payments').insert({ family_id: family.id, stay_id: stayId, amount_minor: 1, currency: 'NAD' })).error).not.toBeNull();
        expect((await user.client.from('stays').update({ name: 'Hacked' }).eq('id', stayId).select('id')).data).toEqual([]);
      }
    });

    it('lets only the owner change roles, and a removed member loses access immediately', async () => {
      const { family, owner, adult, member } = await createFamilyWithRoles();
      expect((await adult.client.from('family_members').update({ role: 'owner' }).eq('user_id', member.id).select()).data).toEqual([]);
      expect((await member.client.from('family_members').update({ role: 'adult' }).eq('user_id', member.id).select()).data).toEqual([]);
      const promote = await owner.client.from('family_members').update({ role: 'adult' }).eq('user_id', member.id).select('role');
      expect(promote.data).toEqual([{ role: 'adult' }]);
      expect((await member.client.from('stays').select('id')).error).toBeNull();
      await owner.client.from('family_members').update({ status: 'removed' }).eq('user_id', member.id);
      expect((await member.client.from('trips').select('id')).data).toEqual([]);
      expect(family.id).toBeTruthy();
    });

    it('cannot promote itself to owner or create memberships directly', async () => {
      const { family, member } = await createFamilyWithRoles();
      expect((await member.client.from('family_members').update({ role: 'owner' }).eq('user_id', member.id).select()).data).toEqual([]);
      const outsider = await createUser('outsider');
      expect((await outsider.client.from('family_members').insert({ family_id: family.id, user_id: outsider.id, role: 'adult' })).error).not.toBeNull();
      expect((await outsider.client.from('families').update({ owner_user_id: outsider.id }).eq('id', family.id).select()).data).toEqual([]);
    });

    it('isolates two families completely, including writes and foreign keys', async () => {
      const a = await createFamilyWithRoles();
      const b = await createFamilyWithRoles();
      const secret = await a.owner.client.from('journal_entries').insert({ trip_id: a.family.tripId, author_user_id: a.owner.id, title: 'A-Geheimnis', body: 'nur Familie A' }).select('id').single();
      const secretId = (secret.data as { id: string }).id;
      for (const user of [b.owner, b.adult, b.member, b.child]) {
        expect((await user.client.from('journal_entries').select('id').eq('id', secretId)).data, user.role).toEqual([]);
        expect((await user.client.from('trips').select('id').eq('id', a.family.tripId)).data, user.role).toEqual([]);
        expect((await user.client.from('journal_entries').update({ body: 'x' }).eq('id', secretId).select('id')).data, user.role).toEqual([]);
        expect((await user.client.from('journal_entries').delete().eq('id', secretId).select('id')).data, user.role).toEqual([]);
      }
      const crossStay = await b.owner.client.from('stays').insert({ trip_id: a.family.tripId, name: 'Fremd' });
      expect(crossStay.error).not.toBeNull();
      const stayB = (await b.owner.client.from('stays').insert({ trip_id: b.family.tripId, name: 'B-Lodge' }).select('id').single()).data as { id: string };
      const crossPayment = await a.owner.client.from('payments').insert({ family_id: a.family.id, stay_id: stayB.id, amount_minor: 1, currency: 'NAD' });
      expect(crossPayment.error).not.toBeNull();
      expect((await anon.from('trips').select('id')).data ?? []).toEqual([]);
    });

    it('keeps private journal entries and drafts visible to their author only', async () => {
      const { family, owner, adult, member } = await createFamilyWithRoles();
      const mk = async (extra: Record<string, unknown>) => (await member.client.from('journal_entries').insert({ trip_id: family.tripId, author_user_id: member.id, title: 'T', ...extra }).select('id').single()).data as { id: string };
      const priv = await mk({ visibility: 'private' });
      const draft = await mk({ status: 'draft' });
      const open = await mk({});
      for (const reader of [owner, adult]) {
        const ids = ((await reader.client.from('journal_entries').select('id')).data as { id: string }[]).map((r) => r.id);
        expect(ids).toContain(open.id);
        expect(ids).not.toContain(priv.id);
        expect(ids).not.toContain(draft.id);
      }
      expect(((await member.client.from('journal_entries').select('id')).data as unknown[]).length).toBe(3);
    });

    it('creates the sync adapter views per role and applies mutations idempotently via the adapter', async () => {
      const { family, owner, member } = await createFamilyWithRoles();
      const remote = remoteFor(owner, family.id, 'owner');
      const id = crypto.randomUUID();
      const mutation = { id: crypto.randomUUID(), mutation_id: crypto.randomUUID(), device_id: 'dev-x', entity_type: 'action_items', entity_id: id, operation: 'upsert' as const, base_version: null, payload: { id, family_id: family.id, trip_id: family.tripId, title: 'Aufgabe', status: 'open', priority: 'normal' }, status: 'pending' as const, error: null, created_at: new Date().toISOString() };
      expect((await remote.apply(mutation)).status).toBe('ok');
      expect((await remote.apply(mutation)).status).toBe('duplicate');
      const rows = await remoteFor(member, family.id, 'member').pull('action_items');
      expect(rows.map((r) => r.id)).toContain(id);
      expect(config.url).toBeTruthy();
      expect(admin).toBeTruthy();
    });
  });
});

describe.skipIf(available)('auth and family management (real Supabase)', () => {
  it('is not_configured: no local Supabase stack reachable (run scripts/stack.sh up)', () => {
    expect(available).toBe(false);
  });
});

beforeAll(() => undefined);
