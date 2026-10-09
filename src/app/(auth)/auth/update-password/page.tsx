'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Input, Notice } from '@/components/ui';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/lib/auth/password';
import { getSupabase } from '@/lib/supabase/client';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password, repeat);
    if (problem) return setError(problem);
    setBusy(true);
    const { error: updateError } = await getSupabase().auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError('Das Passwort konnte nicht geändert werden. Der Link ist eventuell abgelaufen.');
    router.replace('/');
  }

  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">Neues Passwort</h1>
      <p className="mb-5 text-slate">Mindestens {MIN_PASSWORD_LENGTH} Zeichen.</p>
      <form onSubmit={submit} noValidate className="space-y-4" aria-label="Passwort ändern">
        <Field label="Neues Passwort">{(p) => <Input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <Field label="Passwort wiederholen">{(p) => <Input {...p} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />}</Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" className="w-full" disabled={busy}>Passwort speichern</Button>
      </form>
    </>
  );
}
