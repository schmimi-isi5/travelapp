'use client';

import { Copy, Link2, ShieldCheck, UserMinus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Card, ConfirmationDialog, Field, Input, Notice, PageHeader, Select } from '@/components/ui';
import { useTable } from '@/lib/db/hooks';
import { createInviteToken } from '@/lib/auth/token';
import { getSupabase } from '@/lib/supabase/client';
import { create, update } from '@/lib/db/repo';
import { newId } from '@/lib/db/ids';
import { ROLES, type Member, type Role } from '@/lib/domain/schemas';
import { formatDate, readableTextColor } from '@/lib/formatting';

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', adult: 'Erwachsene/r', member: 'Mitglied', child: 'Kind' };
const ROLE_RIGHTS: Record<Role, string> = {
  owner: 'Verwaltung, Mitglieder, Rechnungen, Dokumente',
  adult: 'Planung, Zahlungen, Dokumente',
  member: 'Beiträge, Medien, Planung; keine Finanz-/Ausweisdaten',
  child: 'Sicherer Modus: Beiträge, Sichtungen, Medien; keine sensiblen Inhalte',
};

function inviteCode(): string {
  return newId().replace(/-/g, '').slice(0, 10).toUpperCase();
}

export default function FamilyPage() {
  const { role, familyId, members, currentUser, isSupabase, sync, online } = useApp();
  const [mailEnabled, setMailEnabled] = useState(false);

  useEffect(() => {
    if (!isSupabase) return;
    void fetch('/api/health', { cache: 'no-store' }).then((r) => r.json()).then((j: { mail?: string }) => setMailEnabled(j.mail === 'configured')).catch(() => setMailEnabled(false));
  }, [isSupabase]);

  async function sendMail(invitationId: string, token: string) {
    await sync();
    const { data } = await getSupabase().auth.getSession();
    const res = await fetch('/api/invitations/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ invitationId, token }) });
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    setMessage(res.ok ? { tone: 'ok', text: 'E-Mail mit dem Einladungslink wurde gesendet.' } : { tone: 'danger', text: body.message ?? 'Die E-Mail konnte nicht gesendet werden.' });
  }
  const invitations = useTable('invitations').rows;
  const isOwner = role === 'owner';
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('member');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const active = members.filter((m) => m.status === 'active');
  const open = invitations.filter((i) => !i.accepted_at && !i.revoked_at);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (isSupabase && !email.trim()) return setMessage({ tone: 'danger', text: 'Für eine Einladung ist die E-Mail-Adresse der eingeladenen Person erforderlich. Nur mit ihr kann die Einladung angenommen werden.' });
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return setMessage({ tone: 'danger', text: 'Bitte eine gültige E-Mail-Adresse eingeben oder das Feld leer lassen.' });
    const expires = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const created = await create('invitations', { family_id: familyId, email: email || null, role: inviteRole, code: isSupabase ? createInviteToken() : inviteCode(), expires_at: expires });
    setEmail('');
    setMessage({ tone: 'ok', text: isSupabase ? 'Einladung erstellt. Kopiere den Link und sende ihn der eingeladenen Person.' : `Einladung erstellt: Code ${created.code}` });
  }

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    const invitation = open.find((i) => i.code === code.trim().toUpperCase());
    if (!invitation) return setMessage({ tone: 'danger', text: 'Einladungscode ungültig, widerrufen oder bereits verwendet.' });
    if (invitation.expires_at < new Date().toISOString()) return setMessage({ tone: 'danger', text: 'Die Einladung ist abgelaufen.' });
    await create('members', { family_id: familyId, display_name: `Neues Mitglied ${active.length + 1}`, role: invitation.role, status: 'active', avatar_color: '#334155' });
    await update('invitations', invitation.id, { accepted_at: new Date().toISOString() });
    setCode('');
    setMessage({ tone: 'ok', text: 'Einladung angenommen. Das neue Mitglied wurde hinzugefügt (Demo).' });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Familie" subtitle="Mitglieder, Rollen und Einladungen. Rechte werden in der Datenbank per Row-Level-Security durchgesetzt." />
      {message && <Notice tone={message.tone === 'ok' ? 'ok' : 'danger'}><span data-testid="family-message">{message.text}</span></Notice>}
      <section aria-labelledby="members-h">
        <h2 id="members-h" className="mb-3 text-lg font-bold">Mitglieder</h2>
        <ul className="divide-y divide-line rounded-lg border border-line bg-white shadow-card">
          {active.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 p-4" data-testid="member-row">
              <span className="grid size-10 place-items-center rounded-full text-sm font-bold" style={{ background: m.avatar_color, color: readableTextColor(m.avatar_color) }} aria-hidden>{m.display_name.replace('Demo-', '').charAt(0)}</span>
              <div className="min-w-0 flex-1"><p className="font-bold">{m.display_name} {m.id === currentUser?.id && <Badge tone="info">du</Badge>}</p><p className="text-sm text-slate">{ROLE_RIGHTS[m.role]}</p></div>
              {isOwner && m.role !== 'owner' ? (
                <>
                  <Select aria-label={`Rolle von ${m.display_name}`} value={m.role} onChange={(e) => void update('members', m.id, { role: e.target.value as Role })} className="w-auto">{ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(m)}><UserMinus size={14} aria-hidden /> Entfernen</Button>
                </>
              ) : <Badge>{ROLE_LABEL[m.role]}</Badge>}
            </li>
          ))}
        </ul>
      </section>
      {isOwner ? (
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Link2 size={18} aria-hidden /> Einladen</h2>
          <form onSubmit={invite} noValidate className="grid gap-3 sm:grid-cols-4" aria-label="Einladung erstellen">
            <div className="sm:col-span-2"><Field label={isSupabase ? 'E-Mail der eingeladenen Person' : 'E-Mail (optional)'}>{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field></div>
            <Field label="Rolle">{(p) => <Select {...p} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>{ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>}</Field>
            <div className="flex items-end"><Button type="submit">Einladung erstellen</Button></div>
          </form>
          <ul className="mt-4 space-y-2" aria-label="Offene Einladungen">
            {open.length === 0 && <li className="text-sm text-muted">Keine offenen Einladungen.</li>}
            {open.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-md bg-sand-50 p-3 text-sm" data-testid="invitation-row">
                {isSupabase ? <span className="font-semibold">{i.email}</span> : <code className="font-mono font-bold">{i.code}</code>}<Badge>{ROLE_LABEL[i.role]}</Badge><span className="text-slate">gültig bis {formatDate(i.expires_at)}</span>
                {isSupabase && i.code && mailEnabled && <Button size="sm" variant="ghost" disabled={!online} onClick={() => void sendMail(i.id, i.code)}>Per E-Mail senden</Button>}
                {isSupabase ? (i.code ? <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/invite?token=${i.code}`)}><Copy size={14} aria-hidden /> Link kopieren</Button> : <span className="text-xs text-muted">Link nur auf dem erstellenden Gerät sichtbar</span>) : <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/family?invite=${i.code}`)}><Copy size={14} aria-hidden /> Link kopieren</Button>}
                <Button size="sm" variant="ghost" onClick={() => void update('invitations', i.id, { revoked_at: new Date().toISOString() })}>Widerrufen</Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Notice tone="info">Nur der Owner kann Mitglieder einladen, Rollen ändern oder entfernen.</Notice>
      )}
      {!isSupabase && <Card>
        <h2 className="mb-2 text-lg font-bold">Einladung annehmen (Demo)</h2>
        <form onSubmit={accept} className="flex flex-wrap gap-3" aria-label="Einladung annehmen">
          <div className="min-w-48 flex-1"><Input aria-label="Einladungscode" placeholder="Code eingeben" value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <Button type="submit" variant="secondary">Annehmen</Button>
        </form>
        <p className="mt-2 text-xs text-muted">Im Supabase-Betrieb wird nur ein Hash des Tokens gespeichert und die Annahme läuft über eine Datenbankfunktion.</p>
      </Card>}
      <Card>
        <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><ShieldCheck size={18} aria-hidden /> Rollen im Überblick</h2>
        <dl className="space-y-2 text-sm">{ROLES.map((r) => <div key={r}><dt className="font-bold">{ROLE_LABEL[r]}</dt><dd className="text-slate">{ROLE_RIGHTS[r]}</dd></div>)}</dl>
      </Card>
      <ConfirmationDialog open={Boolean(removing)} title="Mitglied entfernen?" message={`${removing?.display_name} verliert den Zugriff auf die Familie.`} confirmLabel="Entfernen" onCancel={() => setRemoving(null)} onConfirm={async () => { if (removing) await update('members', removing.id, { status: 'removed' }); setRemoving(null); }} />
    </div>
  );
}
