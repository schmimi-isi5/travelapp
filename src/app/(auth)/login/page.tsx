'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Button, Field, Input, Notice } from '@/components/ui';
import { authErrorMessage } from '@/lib/auth/messages';
import { getSupabase } from '@/lib/supabase/client';

function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { isSupabase, authStatus } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupabase) router.replace('/');
    else if (authStatus === 'ready') router.replace(safeNext(params.get('next')));
    else if (authStatus === 'no_family') router.replace('/setup');
  }, [isSupabase, authStatus, router, params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return setError('Bitte E-Mail und Passwort eingeben.');
    setBusy(true);
    setError(null);
    const { error: signInError } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signInError) setError(authErrorMessage(signInError.message));
  }

  async function reset() {
    if (!email.trim()) return setError('Bitte zuerst die E-Mail-Adresse eingeben.');
    setBusy(true);
    setError(null);
    const { error: resetError } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/update-password` });
    setBusy(false);
    // The same message is shown whether or not the address exists (no account enumeration).
    if (resetError && !/rate limit/i.test(resetError.message)) setInfo('Falls die Adresse bekannt ist, wurde eine E-Mail gesendet.');
    else if (resetError) setError(authErrorMessage(resetError.message));
    else setInfo('Falls die Adresse bekannt ist, wurde eine E-Mail gesendet.');
  }

  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">Anmelden</h1>
      <p className="mb-5 text-slate">Willkommen zurück bei eurer Reise.</p>
      <form onSubmit={submit} noValidate className="space-y-4" aria-label="Anmeldung">
        <Field label="E-Mail">{(p) => <Input {...p} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Passwort">{(p) => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        {error && <Notice tone="danger">{error}</Notice>}
        {info && <Notice tone="info">{info}</Notice>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Moment …' : 'Anmelden'}</Button>
        <button type="button" onClick={() => void reset()} className="w-full text-center text-sm font-semibold text-deep underline">Passwort vergessen?</button>
      </form>
      <p className="mt-5 text-sm text-muted">Eine Registrierung ist nur über eine Einladung der Familie möglich.</p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p>Lädt …</p>}>
      <LoginForm />
    </Suspense>
  );
}
