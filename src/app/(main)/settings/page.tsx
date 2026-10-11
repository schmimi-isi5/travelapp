'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Card, ConfirmationDialog, Field, Input, Notice, PageHeader } from '@/components/ui';
import { fetchProviderStatus, getAiConsent, setAiConsent } from '@/lib/ai/client';
import type { ProviderStatus } from '@/lib/ai/types';
import { isResizeEnabled, setResizeEnabled } from '@/lib/db/image-resize';
import { clearAllLocalData, resetDemo } from '@/lib/db/seed';
import { update } from '@/lib/db/repo';
import { getSupabase } from '@/lib/supabase/client';

const AI_STATE_LABEL: Record<string, string> = { ready: 'bereit', disabled: 'aus', not_configured: 'nicht eingerichtet' };

export default function SettingsPage() {
  const { mode, today, setDemoToday, hasDemoDateOverride, online, isSupabase, role, familyId, currentUser, userEmail, signOut } = useApp();
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [confirm, setConfirm] = useState<'reset' | 'wipe' | null>(null);
  const [name, setName] = useState('');
  const [familyDelete, setFamilyDelete] = useState('');
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [resizePhotos, setResizePhotos] = useState(true);

  useEffect(() => {
    if (currentUser) setName(currentUser.display_name);
  }, [currentUser]);

  async function saveName() {
    if (!currentUser || !name.trim()) return setAccountMessage('Bitte einen Namen eingeben.');
    await update('members', currentUser.id, { display_name: name.trim() });
    setAccountMessage('Name gespeichert.');
  }

  async function deleteFamily() {
    const { data } = await getSupabase().auth.getSession();
    const res = await fetch('/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ familyId, confirm: familyDelete }) });
    const body = (await res.json().catch(() => ({}))) as { message?: string; status?: string };
    if (!res.ok) return setAccountMessage(body.message ?? 'Löschen fehlgeschlagen.');
    await signOut({ discardUnsynced: true });
  }

  useEffect(() => {
    setConsent(getAiConsent());
    setResizePhotos(isResizeEnabled());
    void fetchProviderStatus().then(setStatus);
  }, [online]);

  async function run(action: 'reset' | 'wipe') {
    if (action === 'reset') await resetDemo();
    else await clearAllLocalData();
    window.location.href = '/';
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Einstellungen" subtitle="Datenherkunft, KI-Freigabe, Datenschutz und Demo-Werkzeuge." />
      <Card>
        <h2 className="mb-2 text-lg font-bold">Betriebsmodus</h2>
        {isSupabase ? (
          <p className="flex flex-wrap items-center gap-2" data-testid="mode-supabase"><Badge tone="ok">Live-Version</Badge> Angemeldet als {userEmail}. Daten werden mit dem Server synchronisiert; eine Kopie liegt verschlüsselungsfrei nur in diesem Browser.</p>
        ) : (
          <p className="flex flex-wrap items-center gap-2"><Badge tone="demo">Demo</Badge> Alle Daten liegen in diesem Browser (IndexedDB), es werden keine externen Schlüssel benötigt.</p>
        )}
        {mode.notConfiguredReason ? <div className="mt-3"><Notice tone="warn" title="Live-Version: nicht eingerichtet">{mode.notConfiguredReason}. Hinweise stehen in docs/SUPABASE.md.</Notice></div> : mode.requested === 'demo' && <p className="mt-2 text-sm text-slate">Die Live-Version wird beim Einrichten des Servers aktiviert (<code>NEXT_PUBLIC_APP_MODE=supabase</code>). Ein Wechsel von Demo- zu Echtdaten geschieht nie automatisch, sondern nur über bewussten Import.</p>}
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-bold">KI-Funktionen</h2>
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-5" checked={consent} onChange={(e) => { setConsent(e.target.checked); setAiConsent(e.target.checked); }} /><span><strong>Texte an den KI-Dienst senden dürfen</strong><br /><span className="text-sm text-slate">Nur ausdrücklich ausgewählte Texte (Frage, Tagebuchtext). Nie Dokumente, Ausweise oder Zahlungsdaten. Ohne Freigabe arbeitet die App rein lokal.</span></span></label>
        <p className="mt-3 text-sm" data-testid="ai-status">KI-Anbieter: <strong>{status ? `${status.provider} (${AI_STATE_LABEL[status.state] ?? status.state})` : 'nicht erreichbar'}</strong>{status ? `: ${status.detail}` : ''}</p>
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-bold">Fotos</h2>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 size-5" checked={resizePhotos} onChange={(e) => { setResizePhotos(e.target.checked); setResizeEnabled(e.target.checked); }} />
          <span><strong>Fotos vor dem Hochladen verkleinern (empfohlen)</strong><br /><span className="text-sm text-slate">Große Fotos werden auf dem Gerät auf höchstens 2560 Pixel an der langen Kante verkleinert. Das spart Datenvolumen und Wartezeit bei schlechtem Netz, die Originale bleiben in der Fotos-App deines Handys. Ortsdaten im Foto werden dabei entfernt.</span></span>
        </label>
      </Card>
      {isSupabase && (
        <Card>
          <h2 className="mb-2 text-lg font-bold">Mein Profil</h2>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Anzeigename">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Button variant="secondary" onClick={() => void saveName()}>Speichern</Button>
          </div>
          {accountMessage && <p role="status" className="mt-2 text-sm text-slate">{accountMessage}</p>}
        </Card>
      )}
      {!isSupabase && <Card>
        <h2 className="mb-2 text-lg font-bold">Demo-Datum</h2>
        <p className="mb-3 text-sm text-slate">Steuert „heute“ für Tagesbriefing und Dashboard (nur Demo). Aktuell: {today}</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Datum simulieren">{(p) => <Input {...p} type="date" value={today} onChange={(e) => setDemoToday(e.target.value || null)} />}</Field>
          {hasDemoDateOverride && <Button variant="secondary" onClick={() => setDemoToday(null)}>Echtes Datum verwenden</Button>}
        </div>
      </Card>}
      <Card>
        <h2 className="mb-2 text-lg font-bold">Datenschutz &amp; Löschung</h2>
        <p className="mb-3 text-sm text-slate">Export findest du im <Link href="/archive" className="font-semibold text-deep underline">Erinnerungsarchiv</Link>. Löschen entfernt alle lokalen Daten dieses Geräts unwiderruflich. In der Live-Version löscht der Organisator die Familiendaten auf dem Server (weiter unten, mit Bestätigung).</p>
        {isSupabase ? (
          <div className="space-y-3">
            <p className="text-sm text-slate">Beim Abmelden werden die lokalen Daten dieses Geräts gelöscht (Server-Daten bleiben).</p>
            {role === 'owner' && (
              <div className="rounded-md border border-danger/40 p-3">
                <p className="mb-2 text-sm font-semibold text-danger">Alle Familiendaten unwiderruflich löschen (DSGVO)</p>
                <p className="mb-2 text-sm text-slate">Löscht Familie, Einträge, Medien und Dokumente auf dem Server. Tippe zur Bestätigung LÖSCHEN.</p>
                <div className="flex flex-wrap gap-2"><Input aria-label="Bestätigung" className="w-40" value={familyDelete} onChange={(e) => setFamilyDelete(e.target.value)} /><Button variant="danger" disabled={familyDelete !== 'LÖSCHEN'} onClick={() => void deleteFamily()}>Familie löschen</Button></div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-3"><Button variant="secondary" onClick={() => setConfirm('reset')}>Demo zurücksetzen</Button><Button variant="danger" onClick={() => setConfirm('wipe')}>Alle lokalen Daten löschen</Button></div>
        )}
      </Card>
      <Card><h2 className="mb-2 text-lg font-bold">Weiteres</h2><ul className="list-disc pl-5"><li><Link href="/settings/design-system" className="font-semibold text-deep underline">Design-System ansehen</Link></li><li>Bewegungsreduktion: wird über die Systemeinstellung „Bewegung reduzieren“ respektiert.</li></ul></Card>
      <ConfirmationDialog open={confirm !== null} title={confirm === 'wipe' ? 'Alle lokalen Daten löschen?' : 'Demo zurücksetzen?'} message={confirm === 'wipe' ? 'Alle Einträge, Medien und Dokumente auf diesem Gerät werden gelöscht. Die App startet danach ohne Daten.' : 'Eigene Änderungen gehen verloren, die Demo-Daten werden neu geladen.'} confirmLabel={confirm === 'wipe' ? 'Endgültig löschen' : 'Zurücksetzen'} tone={confirm === 'wipe' ? 'danger' : 'primary'} onCancel={() => setConfirm(null)} onConfirm={() => confirm && void run(confirm)} />
    </div>
  );
}
