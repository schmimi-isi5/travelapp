'use client';

import { Copy, ExternalLink, Link2, Share2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Card, ConfirmationDialog, EmptyState, Field, Input, Notice, PageHeader, Select } from '@/components/ui';
import { createInviteToken, sha256Hex } from '@/lib/auth/token';
import { useTable } from '@/lib/db/hooks';
import { formatDate, formatDateTime, todayIso } from '@/lib/formatting';
import { isAdult } from '@/lib/domain/policy';
import { getSupabase } from '@/lib/supabase/client';

interface LinkRow {
  id: string;
  label: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_seen_at: string | null;
  view_count: number;
}

const TOKEN_KEY = (id: string) => `nb-follow-token:${id}`;
const EXPIRY_AFTER_TRIP_DAYS = 30;

function readToken(id: string): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY(id));
  } catch {
    return null;
  }
}

function linkUrl(token: string): string {
  return `${window.location.origin}/f/${token}`;
}

function statusOf(link: LinkRow): { label: string; tone: 'ok' | 'warn' | 'neutral' } {
  if (link.revoked_at) return { label: 'Beendet', tone: 'neutral' };
  if (link.expires_at && Date.parse(link.expires_at) <= Date.now()) return { label: 'Abgelaufen', tone: 'warn' };
  return { label: 'Aktiv', tone: 'ok' };
}

function ShareSummary() {
  const entries = useTable('journal_entries').rows.filter((e) => e.shared_with_followers).length;
  const photos = useTable('media_assets').rows.filter((m) => m.shared_with_followers).length;
  const sightings = useTable('wildlife_sightings').rows.filter((s) => s.shared_with_followers).length;
  return (
    <p className="text-sm text-slate" data-testid="share-summary">
      Aktuell freigegeben: <strong>{entries}</strong> {entries === 1 ? 'Bericht' : 'Berichte'}, <strong>{photos}</strong> {photos === 1 ? 'Foto' : 'Fotos'}, <strong>{sightings}</strong> {sightings === 1 ? 'Tiersichtung' : 'Tiersichtungen'}. Freigeben könnt ihr im Tagebuch, in der Galerie und im Safari-Tracker.
    </p>
  );
}

function LinkCard({ link, onRevoke }: { link: LinkRow; onRevoke: (link: LinkRow) => void }) {
  const [copied, setCopied] = useState(false);
  const [token] = useState(() => readToken(link.id));
  const status = statusOf(link);
  const isActive = status.label === 'Aktiv';
  async function copy() {
    if (!token) return;
    await navigator.clipboard.writeText(linkUrl(token));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }
  async function share() {
    if (token && navigator.share) await navigator.share({ title: 'Unsere Reise', text: 'Hier könnt ihr unsere Reise verfolgen:', url: linkUrl(token) }).catch(() => undefined);
  }
  return (
    <li className="rounded-lg border border-line bg-white p-4" data-testid="follower-link">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-lg">{link.label}</strong>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <p className="mt-1 text-sm text-slate">
        Erstellt am {formatDate(link.created_at)} · {link.expires_at ? `gültig bis ${formatDate(link.expires_at)}` : 'ohne Ablaufdatum'} ·{' '}
        {link.view_count > 0 ? `${link.view_count}× geöffnet, zuletzt ${formatDateTime(link.last_seen_at)}` : 'noch nicht geöffnet'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {isActive && token && (
          <>
            <Button size="sm" variant="secondary" onClick={copy}><Copy size={16} aria-hidden /> {copied ? 'Kopiert' : 'Link kopieren'}</Button>
            {typeof navigator !== 'undefined' && 'share' in navigator && <Button size="sm" variant="secondary" onClick={share}><Share2 size={16} aria-hidden /> Teilen</Button>}
          </>
        )}
        {isActive && !token && <span className="self-center text-sm text-slate">Der Link ist nur auf dem Gerät abrufbar, auf dem er erstellt wurde.</span>}
        {isActive && <Button size="sm" variant="danger" onClick={() => onRevoke(link)}><Trash2 size={16} aria-hidden /> Beenden</Button>}
      </div>
    </li>
  );
}

function FollowerLinks() {
  const { tripId } = useApp();
  const trips = useTable('trips').rows;
  const trip = trips.find((t) => t.id === tripId);
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [expiry, setExpiry] = useState<'after_trip' | 'none'>('after_trip');
  const [isBusy, setIsBusy] = useState(false);
  const [created, setCreated] = useState<{ label: string; url: string } | null>(null);
  const [toRevoke, setToRevoke] = useState<LinkRow | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await getSupabase().from('follower_links').select('id, label, created_at, expires_at, revoked_at, last_seen_at, view_count').eq('trip_id', tripId).order('created_at', { ascending: false });
    if (loadError) setError(`Die Links konnten nicht geladen werden: ${loadError.message}`);
    else {
      setError(null);
      setLinks((data ?? []) as LinkRow[]);
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  const expiresAt = (): string | null => {
    if (expiry === 'none' || !trip?.end_date) return null;
    const end = new Date(`${trip.end_date}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + EXPIRY_AFTER_TRIP_DAYS);
    return end.toISOString();
  };

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim()) return;
    setIsBusy(true);
    setError(null);
    try {
      const token = createInviteToken();
      const { data, error: rpcError } = await getSupabase().rpc('create_follower_link', { p_trip_id: tripId, p_label: label.trim(), p_token_hash: await sha256Hex(token), p_expires_at: expiresAt() });
      if (rpcError) throw new Error(rpcError.message);
      try {
        window.localStorage.setItem(TOKEN_KEY(String(data)), token);
      } catch {
        /* storage unavailable: the link is still shown once below */
      }
      setCreated({ label: label.trim(), url: linkUrl(token) });
      setLabel('');
      await load();
    } catch (cause) {
      setError(`Der Link konnte nicht erstellt werden: ${cause instanceof Error ? cause.message : 'unbekannter Fehler'}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function revoke(link: LinkRow) {
    setToRevoke(null);
    const { error: rpcError } = await getSupabase().rpc('revoke_follower_link', { p_link_id: link.id });
    if (rpcError) setError(`Der Link konnte nicht beendet werden: ${rpcError.message}`);
    else {
      try {
        window.localStorage.removeItem(TOKEN_KEY(link.id));
      } catch {
        /* nothing to clean */
      }
      await load();
    }
  }

  return (
    <>
      {error && <div className="mb-4"><Notice tone="danger">{error}</Notice></div>}
      <Card className="mb-6 p-5">
        <h2 className="text-lg font-bold">Neuen Link erstellen</h2>
        <form onSubmit={create} className="mt-3 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label="Für wen ist der Link?" hint="z. B. Oma oder Onkel Tom. Nur zur Übersicht, die Person sieht den Namen nicht.">
            {(props) => <Input {...props} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} required placeholder="Oma" />}
          </Field>
          <Field label="Gültigkeit">
            {(props) => (
              <Select {...props} value={expiry} onChange={(e) => setExpiry(e.target.value as 'after_trip' | 'none')}>
                <option value="after_trip" disabled={!trip?.end_date}>{trip?.end_date ? `Bis ${EXPIRY_AFTER_TRIP_DAYS} Tage nach der Reise (empfohlen)` : 'Bis nach der Reise (Reiseende fehlt)'}</option>
                <option value="none">Ohne Ablaufdatum</option>
              </Select>
            )}
          </Field>
          <Button type="submit" disabled={isBusy || !label.trim()}><Link2 size={18} aria-hidden /> Link erstellen</Button>
        </form>
        {created && (
          <div className="mt-4" role="status">
            <Notice tone="ok" title={`Link für „${created.label}“ erstellt`}>
              <p className="break-all font-mono text-sm" data-testid="created-link">{created.url}</p>
              <p className="mt-2 text-sm">Jeder mit diesem Link kann die freigegebenen Inhalte sehen. Gebt ihn nur an Menschen weiter, denen ihr vertraut. Beenden könnt ihr ihn jederzeit.</p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => void navigator.clipboard.writeText(created.url)}><Copy size={16} aria-hidden /> Kopieren</Button>
            </Notice>
          </div>
        )}
      </Card>

      <h2 className="mb-3 text-lg font-bold">Eure Links</h2>
      {links === null ? (
        <p className="text-slate">Lädt …</p>
      ) : links.length === 0 ? (
        <EmptyState icon={<Link2 aria-hidden />} title="Noch kein Link" text="Erstellt einen Link, damit Familie und Freunde die Reise verfolgen können." />
      ) : (
        <ul className="space-y-3">{links.map((l) => <LinkCard key={l.id} link={l} onRevoke={setToRevoke} />)}</ul>
      )}
      <ConfirmationDialog
        open={toRevoke !== null}
        title="Link beenden?"
        message={`Wer den Link für „${toRevoke?.label ?? ''}“ hat, sieht die Reise danach nicht mehr. Das lässt sich nicht rückgängig machen, ihr könnt aber einen neuen Link erstellen.`}
        confirmLabel="Link beenden"
        onConfirm={() => toRevoke && void revoke(toRevoke)}
        onCancel={() => setToRevoke(null)}
      />
    </>
  );
}

export default function FollowersPage() {
  const { role, isSupabase } = useApp();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Mitreisen von zuhause" subtitle="Familie und Freunde verfolgen die Reise über einen privaten Link, ohne Konto." />
      <div className="mb-6 space-y-3">
        <Notice tone="info" title="Was Follower sehen">
          Wo ihr gerade seid (Stationen bis heute, keine künftigen), dazu nur die Berichte, Fotos und Tiersichtungen, die ein Erwachsener ausdrücklich freigegeben hat. Fotos werden ohne Ortsdaten ausgeliefert. Nie zu sehen: Buchungen, Preise, Zahlungen, Dokumente, Unterkunftsadressen, private Einträge.
        </Notice>
        <ShareSummary />
      </div>
      {!isAdult(role) ? (
        <Notice tone="warn">Links verwalten dürfen nur Inhaber und Erwachsene.</Notice>
      ) : isSupabase ? (
        <FollowerLinks />
      ) : (
        <Card className="p-5">
          <p>Im Demo-Modus gibt es keine echten Links. So sieht die Ansicht für Follower aus:</p>
          <a className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-deep px-5 py-2 font-semibold text-white hover:bg-deep-700" href="/f/demo" target="_blank" rel="noopener">
            <ExternalLink size={18} aria-hidden /> Vorschau öffnen
          </a>
          <p className="mt-3 text-sm text-slate">Stand der Vorschau: {formatDate(todayIso())} (Demo-Datum der App).</p>
        </Card>
      )}
    </div>
  );
}
