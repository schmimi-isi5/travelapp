'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Dialog, Field, Input, Notice, Select } from '@/components/ui';
import { formatDateTime } from '@/lib/formatting';
import { loadSettings, removeSettings, saveSettings, testSettings, type MailboxSettings, type SettingsInput } from './client';

const TLS = 'tls';
const STARTTLS = 'starttls';

/** Setting up the mailbox access in the app: server, encryption, login, test. Owner only; others see the state. */
export function MailboxSetup({ origin, onChanged }: { origin: 'app' | 'env' | 'stub' | 'none'; onChanged: () => void }) {
  const [settings, setSettings] = useState<MailboxSettings | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [host, setHost] = useState('');
  const [mode, setMode] = useState(TLS);
  const [port, setPort] = useState('993');
  const [user, setUser] = useState('reise@schmeckseler.de');
  const [password, setPassword] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false);

  const reload = useCallback(async () => {
    const loaded = await loadSettings().catch(() => null);
    if (!loaded) return;
    setSettings(loaded.settings);
    setCanEdit(loaded.canEdit);
    if (loaded.settings) {
      setHost(loaded.settings.host);
      setMode(loaded.settings.isSecure ? TLS : STARTTLS);
      setPort(String(loaded.settings.port));
      setUser(loaded.settings.user);
    }
    setIsOpen(!loaded.settings && origin === 'none' && loaded.canEdit);
  }, [origin]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const input = (): SettingsInput => ({ host: host.trim(), port: Number(port), isSecure: mode === TLS, user: user.trim(), ...(password ? { password } : {}) });
  const isComplete = host.trim().length > 2 && Number(port) > 0 && user.trim().length > 0 && (password.length > 0 || Boolean(settings?.hasPassword));

  function chooseMode(next: string) {
    setMode(next);
    setPort(next === TLS ? '993' : '143');
  }

  async function run(action: () => Promise<void>) {
    setIsBusy(true);
    setResult(null);
    try {
      await action();
    } catch (cause) {
      setResult({ ok: false, text: cause instanceof Error ? cause.message : 'Das hat nicht geklappt.' });
    } finally {
      setIsBusy(false);
    }
  }

  const test = () => run(async () => {
    const outcome = await testSettings(input());
    setResult({ ok: outcome.ok, text: outcome.message });
  });
  const save = () => run(async () => {
    await saveSettings(input());
    setPassword('');
    await reload();
    setIsOpen(false);
    setResult({ ok: true, text: 'Gespeichert. Mit „Postfach abrufen“ holst Du jetzt die Mails.' });
    onChanged();
  });
  const remove = () => run(async () => {
    await removeSettings();
    setIsConfirmingRemoval(false);
    setSettings(null);
    setPassword('');
    await reload();
    onChanged();
  });

  const summary = settings
    ? `${settings.user} auf ${settings.host}, Port ${settings.port}, ${settings.isSecure ? 'SSL/TLS' : 'STARTTLS'} · zuletzt geändert ${formatDateTime(settings.updatedAt)}`
    : origin === 'env' ? 'Der Zugang kommt aus den Server-Einstellungen (Coolify).' : null;

  return (
    <Card data-testid="mailbox-setup">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Zugang zum Postfach</h2>
        {canEdit && !isOpen && <Button size="sm" variant="secondary" onClick={() => setIsOpen(true)}>{settings ? 'Zugang ändern' : 'Zugang einrichten'}</Button>}
      </div>
      {summary && !isOpen && <p className="mt-1 text-sm text-slate" data-testid="mailbox-summary">{summary}</p>}
      {settings?.passwordUnreadable && !isOpen && <div className="mt-2"><Notice tone="warn">Das gespeicherte Passwort kann nicht mehr gelesen werden. Bitte den Zugang öffnen und das Passwort neu eingeben.</Notice></div>}
      {!canEdit && !summary && <p className="mt-1 text-sm text-slate">Der Besitzer der Familie richtet das Postfach ein.</p>}
      {isOpen && canEdit && (
        <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          <p className="text-sm text-slate">Die Angaben stehen bei Deinem Mail-Anbieter unter „IMAP“. Das Passwort wird verschlüsselt gespeichert und nie wieder angezeigt. Die App liest nur und verändert nichts im Postfach.</p>
          <Field label="IMAP-Server">{(p) => <Input {...p} value={host} onChange={(e) => setHost(e.target.value)} placeholder="imap.beispiel.de" autoComplete="off" />}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Verschlüsselung">{(p) => <Select {...p} value={mode} onChange={(e) => chooseMode(e.target.value)}><option value={TLS}>SSL/TLS (Port 993, empfohlen)</option><option value={STARTTLS}>STARTTLS (Port 143)</option></Select>}</Field>
            <Field label="Port">{(p) => <Input {...p} inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} />}</Field>
          </div>
          <Field label="Benutzername">{(p) => <Input {...p} value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />}</Field>
          <Field label="Passwort" hint={settings?.hasPassword ? 'Gespeichert. Leer lassen, um es zu behalten.' : 'Bei manchen Anbietern ist ein App-Passwort nötig.'}>{(p) => <Input {...p} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}</Field>
          {result && <Notice tone={result.ok ? 'info' : 'warn'}><span data-testid="mailbox-test-result">{result.text}</span></Notice>}
          <div className="flex flex-wrap justify-between gap-2">
            {settings ? <Button variant="danger" size="sm" onClick={() => setIsConfirmingRemoval(true)}>Zugang entfernen</Button> : <span />}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void test()} disabled={isBusy || !isComplete}>{isBusy ? 'Bitte warten …' : 'Verbindung testen'}</Button>
              <Button type="submit" disabled={isBusy || !isComplete}>Speichern</Button>
              {settings && <Button variant="ghost" onClick={() => { setIsOpen(false); setResult(null); setPassword(''); }}>Abbrechen</Button>}
            </div>
          </div>
        </form>
      )}
      {!isOpen && result && <div className="mt-2"><Notice tone={result.ok ? 'info' : 'warn'}><span data-testid="mailbox-test-result">{result.text}</span></Notice></div>}
      <Dialog open={isConfirmingRemoval} onClose={() => setIsConfirmingRemoval(false)} title="Zugang entfernen?">
        <p className="text-slate">Das gespeicherte Passwort wird gelöscht. Bereits abgelegte Mails bleiben erhalten.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsConfirmingRemoval(false)}>Abbrechen</Button>
          <Button variant="danger" disabled={isBusy} onClick={() => void remove()}>Entfernen</Button>
        </div>
      </Dialog>
    </Card>
  );
}
