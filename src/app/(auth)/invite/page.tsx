'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Button, Field, Input, Notice } from '@/components/ui';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/lib/auth/password';
import { authErrorMessage } from '@/lib/auth/messages';
import { getSupabase } from '@/lib/supabase/client';

function Invite() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const { isSupabase, authStatus, userEmail, refreshMembership } = useApp();
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [accountExists, setAccountExists] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isSupabase) {
    return <Notice tone="info">Einladungen gibt es nur im Supabase-Betrieb. Im Demo-Modus nutzt du den Code unter „Familie“.</Notice>;
  }
  if (!token) return <Notice tone="danger">Dieser Link enthält keine Einladung. Bitte öffne den vollständigen Link, den du erhalten hast.</Notice>;

  async function accept(name?: string) {
    const supabase = getSupabase();
    const { error: rpcError } = await supabase.rpc('accept_invitation', { raw_token: token });
    if (rpcError) {
      setError(/invalid or expired/i.test(rpcError.message) ? 'Die Einladung ist ungültig, abgelaufen oder gehört zu einer anderen E-Mail-Adresse.' : 'Die Einladung konnte nicht angenommen werden.');
      return false;
    }
    if (name) {
      const { data } = await supabase.auth.getUser();
      if (data.user) await supabase.from('profiles').update({ display_name: name }).eq('user_id', data.user.id);
    }
    await refreshMembership();
    router.replace('/');
    return true;
  }

  async function register(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password, repeat);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const res = await fetch('/api/invitations/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password, displayName: displayName.trim() || undefined }) });
    const body = (await res.json().catch(() => ({}))) as { email?: string; error?: string; message?: string };
    if (res.status === 409) {
      setAccountExists(true);
      setBusy(false);
      return;
    }
    if (!res.ok || !body.email) {
      setError(body.message ?? 'Die Registrierung ist fehlgeschlagen.');
      setBusy(false);
      return;
    }
    const { error: signInError } = await getSupabase().auth.signInWithPassword({ email: body.email, password });
    if (signInError) {
      setError(authErrorMessage(signInError.message));
      setBusy(false);
      return;
    }
    await accept(displayName.trim() || undefined);
    setBusy(false);
  }

  if (authStatus === 'ready' || authStatus === 'no_family') {
    return (
      <>
        <h1 className="mb-1 text-2xl font-extrabold">Einladung annehmen</h1>
        <p className="mb-5 text-slate">Du bist als <strong>{userEmail}</strong> angemeldet.</p>
        {error && <div className="mb-3"><Notice tone="danger">{error}</Notice></div>}
        <Button className="w-full" disabled={busy} onClick={() => { setBusy(true); void accept().finally(() => setBusy(false)); }}>Einladung annehmen</Button>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">Willkommen in der Familie</h1>
      <p className="mb-5 text-slate">Lege ein Passwort fest, um die Einladung anzunehmen.</p>
      {accountExists ? (
        <Notice tone="info" title="Konto vorhanden">
          Für diese Einladung gibt es schon ein Konto. <Link className="font-semibold underline" href={`/login?next=${encodeURIComponent(`/invite?token=${token}`)}`}>Jetzt anmelden</Link>, danach kannst du die Einladung annehmen.
        </Notice>
      ) : (
        <form onSubmit={register} noValidate className="space-y-4" aria-label="Registrierung per Einladung">
          <Field label="Dein Name" hint="So sehen dich die anderen. Optional.">{(p) => <Input {...p} autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}</Field>
          <Field label="Passwort" hint={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          <Field label="Passwort wiederholen">{(p) => <Input {...p} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />}</Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Moment …' : 'Registrieren und beitreten'}</Button>
        </form>
      )}
      <p className="mt-5 text-sm text-muted">Schon ein Konto? <Link className="font-semibold text-deep underline" href={`/login?next=${encodeURIComponent(`/invite?token=${token}`)}`}>Anmelden</Link></p>
    </>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<p>Lädt …</p>}>
      <Invite />
    </Suspense>
  );
}
