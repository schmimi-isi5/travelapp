'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Button, Field, Input, Notice } from '@/components/ui';
import { getSupabase } from '@/lib/supabase/client';

export default function SetupPage() {
  const router = useRouter();
  const { isSupabase, authStatus, familyId, hasTrip, role, refreshMembership, signOut, userEmail } = useApp();
  const [familyName, setFamilyName] = useState('');
  const [title, setTitle] = useState('Namibia & Botswana');
  const [startDate, setStartDate] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupabase) router.replace('/');
    else if (authStatus === 'signed_out') router.replace('/login');
    else if (authStatus === 'ready' && hasTrip) router.replace('/');
  }, [isSupabase, authStatus, hasTrip, router]);

  const needsFamily = authStatus === 'no_family';
  const canCreateTrip = authStatus === 'ready' && !hasTrip && (role === 'owner' || role === 'adult');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (needsFamily && !familyName.trim()) return setError('Bitte einen Familiennamen eingeben.');
    if (!title.trim()) return setError('Bitte einen Reisetitel eingeben.');
    setBusy(true);
    setError(null);
    const supabase = getSupabase();
    let targetFamily = familyId;
    if (needsFamily) {
      const { data, error: rpcError } = await supabase.rpc('create_family', { family_name: familyName.trim() });
      if (rpcError || !data) {
        setBusy(false);
        return setError('Die Familie konnte nicht angelegt werden.');
      }
      targetFamily = String(data);
    }
    const { error: tripError } = await supabase.from('trips').insert({
      family_id: targetFamily,
      title: title.trim(),
      start_date: startDate || null,
      countries: ['Namibia', 'Botswana'],
      source_type: 'user_entered',
    });
    if (tripError) {
      setBusy(false);
      return setError('Die Reise konnte nicht angelegt werden. Bitte erneut versuchen.');
    }
    await refreshMembership();
    setBusy(false);
    router.replace('/');
  }

  if (!isSupabase || authStatus === 'loading' || authStatus === 'signed_out') return <p>Lädt …</p>;

  if (authStatus === 'ready' && !canCreateTrip) {
    return (
      <>
        <h1 className="mb-2 text-2xl font-extrabold">Fast geschafft</h1>
        <Notice tone="info">Der Owner richtet die Reise noch ein. Schau später wieder vorbei.</Notice>
        <Button className="mt-4 w-full" variant="secondary" onClick={() => void signOut({ discardUnsynced: true })}>Abmelden</Button>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-1 text-2xl font-extrabold">{needsFamily ? 'Familie einrichten' : 'Reise anlegen'}</h1>
      <p className="mb-5 text-slate">Angemeldet als {userEmail}. Es werden keine Demo-Daten angelegt, die Familie startet leer.</p>
      <form onSubmit={submit} noValidate className="space-y-4" aria-label="Einrichtung">
        {needsFamily && <Field label="Name der Familie">{(p) => <Input {...p} value={familyName} onChange={(e) => setFamilyName(e.target.value)} />}</Field>}
        <Field label="Titel der Reise">{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Abreisedatum" hint="Optional, später änderbar.">{(p) => <Input {...p} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />}</Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Moment …' : needsFamily ? 'Familie gründen' : 'Reise anlegen'}</Button>
      </form>
      {needsFamily && (
        <div className="mt-6 border-t border-line pt-4">
          <h2 className="mb-2 font-bold">Du wurdest eingeladen?</h2>
          <p className="mb-2 text-sm text-slate">Öffne den Einladungslink oder füge den Token hier ein.</p>
          <div className="flex gap-2">
            <Input aria-label="Einladungstoken" value={inviteToken} onChange={(e) => setInviteToken(e.target.value)} />
            <Button variant="secondary" onClick={() => inviteToken.trim() && router.push(`/invite?token=${encodeURIComponent(inviteToken.trim())}`)}>Weiter</Button>
          </div>
        </div>
      )}
    </>
  );
}
