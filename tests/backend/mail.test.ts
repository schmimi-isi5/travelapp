import { randomBytes } from 'node:crypto';
import { createConnection } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { anon, backendAvailable, createFamily, createFamilyWithRoles, createUser, deleteCreatedUsers, sha256, uniq } from './harness';

const available = await backendAvailable();
const MAILPIT_API = process.env.MAILPIT_URL ?? 'http://localhost:18025';
const SMTP_PORT = Number(process.env.MAILPIT_SMTP_PORT ?? 11025);

async function smtpReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port: SMTP_PORT, timeout: 1500 });
    socket.on('connect', () => (socket.destroy(), resolve(true)));
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => (socket.destroy(), resolve(false)));
  });
}
const mailpitUp = await fetch(`${MAILPIT_API}/api/v1/info`).then((r) => r.ok).catch(() => false);
const smtpUp = await smtpReachable();

interface MailSummary { ID: string; Subject: string; To: { Address: string }[] }

async function waitForMail(to: string, timeoutMs = 15_000): Promise<{ summary: MailSummary; text: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_API}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const body = (await res.json()) as { messages?: MailSummary[] };
    const summary = body.messages?.[0];
    if (summary) {
      const full = (await (await fetch(`${MAILPIT_API}/api/v1/message/${summary.ID}`)).json()) as { Text: string };
      return { summary, text: full.Text };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`keine E-Mail an ${to} erhalten`);
}

describe.skipIf(!available || !mailpitUp)('e-mail delivery (auth service SMTP and invitation mails)', () => {
  afterAll(deleteCreatedUsers);

  it('sends the password-reset mail through the configured SMTP server', async () => {
    const user = await createUser('reset');
    const { error } = await anon.auth.resetPasswordForEmail(user.email);
    expect(error).toBeNull();
    const { summary, text } = await waitForMail(user.email);
    expect(summary.Subject.length).toBeGreaterThan(0);
    expect(text).toMatch(/verify\?token=|token=/);
  });

  it.skipIf(!smtpUp)('delivers invitation links by mail for owners/adults only, using the stored address', async () => {
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(SMTP_PORT);
    process.env.SMTP_FROM = 'Reise-App <reise@example.test>';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://reise.example.test';
    const { POST } = await import('@/app/api/invitations/send/route');
    const { family, owner, member } = await createFamilyWithRoles();
    const token = randomBytes(32).toString('base64url');
    const email = `eingeladen.${uniq()}@example.test`;
    const { data } = await owner.client.from('invitations').insert({ family_id: family.id, email, role: 'member', token_hash: await sha256(token), expires_at: new Date(Date.now() + 3600_000).toISOString() }).select('id').single();
    const invitationId = (data as { id: string }).id;
    const call = (bearer: string | null, body: unknown) => POST(new Request('http://app/api/invitations/send', { method: 'POST', headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), 'x-forwarded-for': `10.9.0.${Math.floor(Math.random() * 200)}` }, body: JSON.stringify(body) }));

    expect((await call(null, { invitationId, token })).status).toBe(401);
    expect((await call(member.accessToken, { invitationId, token })).status).toBe(400); // members cannot even see the invitation
    expect((await call(owner.accessToken, { invitationId, token: randomBytes(32).toString('base64url') })).status).toBe(400); // wrong token
    const res = await call(owner.accessToken, { invitationId, token });
    expect(res.status).toBe(200);
    const mail = await waitForMail(email);
    expect(mail.text).toContain(`https://reise.example.test/invite?token=${token}`);
    expect(mail.summary.To[0]?.Address).toBe(email);
    expect(family.id).toBeTruthy();
    void createFamily;
  });
});

describe.skipIf(available && mailpitUp)('e-mail delivery (auth service SMTP and invitation mails)', () => {
  it('is not_configured: local stack or Mailpit not reachable (run scripts/stack.sh up)', () => {
    expect(available && mailpitUp).toBe(false);
  });
});
