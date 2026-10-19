'use client';

import { Ban, CalendarClock, Copy, KeyRound, Link2, Mail, MessageCircle, Pencil, RotateCcw, Share2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Card, ConfirmationDialog, Dialog, EmptyState, Field, Input, Notice, PageHeader, Select } from '@/components/ui';
import { createInviteToken, sha256Hex } from '@/lib/auth/token';
import { useTable } from '@/lib/db/hooks';
import { formatDate, formatDateTime, todayIso } from '@/lib/formatting';
import { isAdult } from '@/lib/domain/policy';
import { FollowerPreviewButton } from '@/features/follow/preview-button';
import { PREVIEW_LABEL } from '@/features/follow/preview';
import { EXPIRY_AFTER_TRIP_DAYS, expiryFor, linkStatus, mailtoUrl, shareMessage, whatsappUrl, type ExpiryChoice, type LinkRow, type LinkStatus } from '@/features/follow/links';
import { getSupabase } from '@/lib/supabase/client';

const TOKEN_KEY = (id: string) => `nb-follow-token:${id}`;

function readToken(id: string): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY(id));
  } catch {
    return null;
  }
}

function storeToken(id: string, token: string) {
  try {
    window.localStorage.setItem(TOKEN_KEY(id), token);
  } catch {
    /* storage unavailable: the link is still shown once */
  }
}

function forgetToken(id: string) {
  try {
    window.localStorage.removeItem(TOKEN_KEY(id));
  } catch {
    /* nothing to clean */
  }
}

function linkUrl(token: string): string {
  return `${window.location.origin}/f/${token}`;
}

const STATUS_BADGE: Record<LinkStatus, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  active: { label: 'Aktiv', tone: 'ok' },
  ended: { label: 'Beendet', tone: 'neutral' },
  expired: { label: 'Abgelaufen', tone: 'warn' },
};

function ShareSummary() {
  const entries = useTable('journal_entries').rows.filter((e) => e.shared_with_followers).length;
  const familyPhotos = useTable('media_assets').rows.filter((m) => m.kind === 'photo' && m.visibility === 'family');
  const photos = familyPhotos.filter((m) => !m.hidden_from_followers).length;
  const hidden = familyPhotos.length - photos;
  const sightings = useTable('wildlife_sightings').rows.filter((s) => s.shared_with_followers).length;
  return (
    <p className="text-sm text-slate" data-testid="share-summary">
      Aktuell sichtbar: <strong>{photos}</strong> {photos === 1 ? 'Foto' : 'Fotos'}{hidden > 0 && <> ({hidden} ausgeblendet)</>}. Freigegeben: <strong>{entries}</strong> {entries === 1 ? 'Bericht' : 'Berichte'}, <strong>{sightings}</strong> {sightings === 1 ? 'Tiersichtung' : 'Tiersichtungen'}. Freigeben könnt ihr im Tagebuch, in der Galerie und im Safari-Tracker.
    </p>
  );
}

function SendButtons({ url, name }: { url: string; name: string }) {
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  return (
    <>
      <a href={mailtoUrl(url, name)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-deep hover:bg-sand"><Mail size={16} aria-hidden /> Per E-Mail</a>
      <a href={whatsappUrl(url, name)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-deep hover:bg-sand"><MessageCircle size={16} aria-hidden /> WhatsApp</a>
      {canShare && (
        <Button size="sm" variant="secondary" onClick={() => void navigator.share({ title: 'Unsere Reise', text: shareMessage(url, name) }).catch(() => undefined)}><Share2 size={16} aria-hidden /> Teilen</Button>
      )}
    </>
  );
}

interface CardActions {
  onRevoke: (link: LinkRow) => void;
  onReactivate: (link: LinkRow) => void;
  onRenew: (link: LinkRow) => void;
  onRename: (link: LinkRow) => void;
  onDelete: (link: LinkRow) => void;
}

function LinkCard({ link, actions }: { link: LinkRow; actions: CardActions }) {
  const [copied, setCopied] = useState(false);
  const [token] = useState(() => readToken(link.id));
  const state = linkStatus(link);
  const badge = STATUS_BADGE[state];
  const isActive = state === 'active';
  const url = token ? linkUrl(token) : null;
  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }
  return (
    <li className="rounded-lg border border-line bg-white p-4" data-testid="follower-link" data-status={state}>
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-lg">{link.label}</strong>
        <Badge tone={badge.tone}>{badge.label}</Badge>
        <button type="button" onClick={() => actions.onRename(link)} className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-deep hover:bg-sand" aria-label={`„${link.label}“ umbenennen`}>
          <Pencil size={16} aria-hidden /> Umbenennen
        </button>
      </div>
      <p className="mt-1 text-sm text-slate">
        Erstellt am {formatDate(link.created_at)} · {link.expires_at ? `${state === 'expired' ? 'abgelaufen am' : 'gültig bis'} ${formatDate(link.expires_at)}` : 'ohne Ablaufdatum'} ·{' '}
        {link.view_count > 0 ? `${link.view_count}× geöffnet, zuletzt ${formatDateTime(link.last_seen_at)}` : 'noch nicht geöffnet'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {isActive && url && (
          <>
            <Button size="sm" variant="secondary" onClick={copy}><Copy size={16} aria-hidden /> {copied ? 'Kopiert' : 'Link kopieren'}</Button>
            <SendButtons url={url} name={link.label} />
          </>
        )}
        {isActive && !url && <span className="self-center text-sm text-slate">Die Adresse ist nur auf dem Gerät abrufbar, auf dem der Link erstellt wurde. Für ein anderes Gerät gibt es einen neuen Link.</span>}
        {isActive && !url && <Button size="sm" variant="secondary" onClick={() => actions.onRenew(link)}><KeyRound size={16} aria-hidden /> Neuen Link ausstellen</Button>}
        {isActive && url && <Button size="sm" variant="secondary" onClick={() => actions.onReactivate(link)}><CalendarClock size={16} aria-hidden /> Gültigkeit ändern</Button>}
        {isActive && <Button size="sm" variant="secondary" onClick={() => actions.onRevoke(link)}><Ban size={16} aria-hidden /> Beenden</Button>}
        {!isActive && <Button size="sm" onClick={() => actions.onReactivate(link)}><RotateCcw size={16} aria-hidden /> Reaktivieren und erneut senden</Button>}
        <Button size="sm" variant="danger" onClick={() => actions.onDelete(link)}><Trash2 size={16} aria-hidden /> Löschen</Button>
      </div>
    </li>
  );
}

const EXPIRY_LABELS: Record<ExpiryChoice, string> = {
  after_trip: `Bis ${EXPIRY_AFTER_TRIP_DAYS} Tage nach der Reise (empfohlen)`,
  week: 'Eine Woche',
  month: '30 Tage',
  none: 'Ohne Ablaufdatum',
};

/** Reactivates a link (same address) or issues a new address; both end with the link shown for sending. */
function ReactivateDialog({ target, tripEnd, onClose, onDone, onError }: { target: { link: LinkRow; renew: boolean } | null; tripEnd: string | null | undefined; onClose: () => void; onDone: (shown: { label: string; url: string }) => void; onError: (message: string) => void }) {
  const [choice, setChoice] = useState<ExpiryChoice>('after_trip');
  const [isBusy, setIsBusy] = useState(false);
  const link = target?.link;
  const existing = link ? readToken(link.id) : null;
  const isRenew = !!target && (target.renew || !existing);
  const effective: ExpiryChoice = expiryFor(choice, tripEnd) === undefined ? 'none' : choice; // an unusable choice falls back to no expiry
  const expiry = expiryFor(effective, tripEnd) ?? null;
  async function submit() {
    if (!link) return;
    setIsBusy(true);
    try {
      const supabase = getSupabase();
      let token = existing;
      if (isRenew || !token) {
        token = createInviteToken();
        const { error } = await supabase.rpc('rotate_follower_link', { p_link_id: link.id, p_token_hash: await sha256Hex(token), p_expires_at: expiry });
        if (error) throw new Error(error.message);
        storeToken(link.id, token);
      } else {
        const { error } = await supabase.rpc('reactivate_follower_link', { p_link_id: link.id, p_expires_at: expiry });
        if (error) throw new Error(error.message);
      }
      onDone({ label: link.label, url: linkUrl(token) });
    } catch (cause) {
      onError(`Der Link konnte nicht aktiviert werden: ${cause instanceof Error ? cause.message : 'unbekannter Fehler'}`);
    } finally {
      setIsBusy(false);
      onClose();
    }
  }
  return (
    <Dialog open={target !== null} onClose={onClose} title={isRenew ? 'Neuen Link ausstellen' : 'Link wieder freischalten'}>
      <p className="text-slate">
        {isRenew
          ? `Für „${link?.label ?? ''}“ entsteht eine neue Adresse. Die bisherige Adresse funktioniert danach nicht mehr.`
          : `Die bisherige Adresse von „${link?.label ?? ''}“ funktioniert danach wieder, ihr müsst nichts neu verschicken.`}
      </p>
      <div className="mt-4">
        <Field label="Gültigkeit">
          {(props) => (
            <Select {...props} value={effective} onChange={(e) => setChoice(e.target.value as ExpiryChoice)}>
              {(Object.keys(EXPIRY_LABELS) as ExpiryChoice[]).map((key) => (
                <option key={key} value={key} disabled={expiryFor(key, tripEnd) === undefined}>{EXPIRY_LABELS[key]}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
        <Button onClick={() => void submit()} disabled={isBusy}>{isRenew ? 'Neuen Link ausstellen' : 'Freischalten'}</Button>
      </div>
    </Dialog>
  );
}

function RenameDialog({ link, onClose, onSave }: { link: LinkRow | null; onClose: () => void; onSave: (link: LinkRow, label: string) => void }) {
  const [label, setLabel] = useState('');
  useEffect(() => setLabel(link?.label ?? ''), [link]);
  return (
    <Dialog open={link !== null} onClose={onClose} title="Link umbenennen">
      <form onSubmit={(e) => { e.preventDefault(); if (link && label.trim()) onSave(link, label.trim()); }}>
        <Field label="Für wen ist der Link?" hint="Nur zur Übersicht, die Person sieht den Namen nicht.">
          {(props) => <Input {...props} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} required />}
        </Field>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" disabled={!label.trim()}>Speichern</Button>
        </div>
      </form>
    </Dialog>
  );
}

function SentLink({ shown, onClose }: { shown: { label: string; url: string }; onClose: () => void }) {
  return (
    <div className="mt-4" role="status">
      <Notice tone="ok" title={`Link für „${shown.label}“ ist bereit`}>
        <p className="break-all font-mono text-sm" data-testid="created-link">{shown.url}</p>
        <p className="mt-2 text-sm">Jeder mit diesem Link kann die freigegebenen Inhalte sehen. Gebt ihn nur an Menschen weiter, denen ihr vertraut. Beenden könnt ihr ihn jederzeit.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard.writeText(shown.url)}><Copy size={16} aria-hidden /> Kopieren</Button>
          <SendButtons url={shown.url} name={shown.label} />
          <Button size="sm" variant="ghost" onClick={onClose}>Schließen</Button>
        </div>
      </Notice>
    </div>
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
  const [shown, setShown] = useState<{ label: string; url: string } | null>(null);
  const [toRevoke, setToRevoke] = useState<LinkRow | null>(null);
  const [toDelete, setToDelete] = useState<LinkRow | null>(null);
  const [toRename, setToRename] = useState<LinkRow | null>(null);
  const [toReactivate, setToReactivate] = useState<{ link: LinkRow; renew: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await getSupabase().from('follower_links').select('id, label, created_at, expires_at, revoked_at, last_seen_at, view_count').eq('trip_id', tripId).order('created_at', { ascending: false });
    if (loadError) setError(`Die Links konnten nicht geladen werden: ${loadError.message}`);
    else {
      setError(null);
      setLinks(((data ?? []) as LinkRow[]).filter((l) => l.label !== PREVIEW_LABEL));
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const expiresAt = expiryFor(effectiveExpiry, trip?.end_date) ?? null;
    if (!label.trim()) return;
    setIsBusy(true);
    setError(null);
    try {
      const token = createInviteToken();
      const { data, error: rpcError } = await getSupabase().rpc('create_follower_link', { p_trip_id: tripId, p_label: label.trim(), p_token_hash: await sha256Hex(token), p_expires_at: expiresAt });
      if (rpcError) throw new Error(rpcError.message);
      storeToken(String(data), token);
      setShown({ label: label.trim(), url: linkUrl(token) });
      setLabel('');
      await load();
    } catch (cause) {
      setError(`Der Link konnte nicht erstellt werden: ${cause instanceof Error ? cause.message : 'unbekannter Fehler'}`);
    } finally {
      setIsBusy(false);
    }
  }

  /** One RPC call, then reload; failures show the German message with the cause. */
  async function run(fn: string, args: Record<string, unknown>, failure: string, after?: () => void) {
    const { error: rpcError } = await getSupabase().rpc(fn, args);
    if (rpcError) setError(`${failure}: ${rpcError.message}`);
    else {
      setError(null);
      after?.();
      await load();
    }
  }

  const revoke = (link: LinkRow) => {
    setToRevoke(null);
    return run('revoke_follower_link', { p_link_id: link.id }, 'Der Link konnte nicht beendet werden');
  };
  const remove = (link: LinkRow) => {
    setToDelete(null);
    return run('delete_follower_link', { p_link_id: link.id }, 'Der Link konnte nicht gelöscht werden', () => forgetToken(link.id));
  };
  const rename = (link: LinkRow, newLabel: string) => {
    setToRename(null);
    return run('rename_follower_link', { p_link_id: link.id, p_label: newLabel }, 'Der Link konnte nicht umbenannt werden');
  };
  const actions: CardActions = {
    onRevoke: setToRevoke,
    onDelete: setToDelete,
    onRename: setToRename,
    onReactivate: (link) => setToReactivate({ link, renew: false }),
    onRenew: (link) => setToReactivate({ link, renew: true }),
  };

  const effectiveExpiry = expiryFor(expiry, trip?.end_date) === undefined ? 'none' : expiry; // without a usable trip end the link has no expiry
  const active = (links ?? []).filter((l) => linkStatus(l) === 'active');
  const inactive = (links ?? []).filter((l) => linkStatus(l) !== 'active');
  const unopened = active.filter((l) => l.view_count === 0).length;

  return (
    <>
      {error && <div className="mb-4"><Notice tone="danger">{error}</Notice></div>}
      <Card className="mb-6 p-5" data-testid="preview-card">
        <h2 className="text-lg font-bold">Vorschau</h2>
        <p className="mb-3 mt-1 text-sm text-slate">So sehen Mitreisende die Seite, mit euren echten Fotos und Berichten. Dafür entsteht ein eigener Link, der nach zwei Stunden von selbst endet und hier nicht aufgelistet wird.</p>
        <FollowerPreviewButton />
      </Card>
      <Card className="mb-6 p-5">
        <h2 className="text-lg font-bold">Neuen Link erstellen</h2>
        <form onSubmit={create} className="mt-3 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label="Für wen ist der Link?" hint="z. B. Oma oder Onkel Tom. Nur zur Übersicht, die Person sieht den Namen nicht.">
            {(props) => <Input {...props} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} required placeholder="Oma" />}
          </Field>
          <Field label="Gültigkeit">
            {(props) => (
              <Select {...props} value={effectiveExpiry} onChange={(e) => setExpiry(e.target.value as 'after_trip' | 'none')}>
                <option value="after_trip" disabled={expiryFor('after_trip', trip?.end_date) === undefined}>{trip?.end_date ? EXPIRY_LABELS.after_trip : 'Bis nach der Reise (Reiseende fehlt)'}</option>
                <option value="none">{EXPIRY_LABELS.none}</option>
              </Select>
            )}
          </Field>
          <Button type="submit" disabled={isBusy || !label.trim()}><Link2 size={18} aria-hidden /> Link erstellen</Button>
        </form>
        {shown && <SentLink shown={shown} onClose={() => setShown(null)} />}
      </Card>

      {links === null ? (
        <p className="text-slate">Lädt …</p>
      ) : links.length === 0 ? (
        <EmptyState icon={<Link2 aria-hidden />} title="Noch kein Link" text="Erstellt einen Link, damit Familie und Freunde die Reise verfolgen können." />
      ) : (
        <>
          <h2 className="mb-1 text-lg font-bold">Eure Links ({active.length} aktiv)</h2>
          {unopened > 0 && <p className="mb-3 text-sm text-slate">{unopened === 1 ? 'Ein aktiver Link wurde' : `${unopened} aktive Links wurden`} noch nicht geöffnet. Vielleicht lohnt eine Erinnerung.</p>}
          {active.length === 0 ? <p className="mb-6 text-slate">Gerade ist kein Link aktiv.</p> : <ul className="mb-8 mt-3 space-y-3">{active.map((l) => <LinkCard key={l.id} link={l} actions={actions} />)}</ul>}
          {inactive.length > 0 && (
            <section aria-label="Beendete und abgelaufene Links">
              <h2 className="mb-3 text-lg font-bold">Beendet oder abgelaufen ({inactive.length})</h2>
              <ul className="space-y-3">{inactive.map((l) => <LinkCard key={l.id} link={l} actions={actions} />)}</ul>
            </section>
          )}
        </>
      )}

      <ConfirmationDialog
        open={toRevoke !== null}
        title="Link beenden?"
        message={`Wer den Link für „${toRevoke?.label ?? ''}“ hat, sieht die Reise danach nicht mehr. Ihr könnt ihn jederzeit wieder freischalten.`}
        confirmLabel="Link beenden"
        onConfirm={() => toRevoke && void revoke(toRevoke)}
        onCancel={() => setToRevoke(null)}
      />
      <ConfirmationDialog
        open={toDelete !== null}
        title="Link löschen?"
        message={`Der Eintrag „${toDelete?.label ?? ''}“ verschwindet samt Zugriffszähler, der Link funktioniert nicht mehr. Das lässt sich nicht rückgängig machen. Neu erstellen könnt ihr ihn aber jederzeit.`}
        confirmLabel="Endgültig löschen"
        onConfirm={() => toDelete && void remove(toDelete)}
        onCancel={() => setToDelete(null)}
      />
      <RenameDialog link={toRename} onClose={() => setToRename(null)} onSave={(link, newLabel) => void rename(link, newLabel)} />
      <ReactivateDialog target={toReactivate} tripEnd={trip?.end_date} onClose={() => setToReactivate(null)} onDone={(s) => { setError(null); setShown(s); void load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onError={setError} />
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
          Wo ihr gerade seid (Stationen bis heute, keine künftigen), dazu alle Familienfotos, außer denen, die ihr ausblendet (in der Galerie am Auge-Symbol des Fotos), sowie die Berichte und Tiersichtungen, die ein Erwachsener ausdrücklich freigegeben hat. Fotos werden ohne Ortsdaten ausgeliefert, private Fotos nie gezeigt. Nie zu sehen: Buchungen, Preise, Zahlungen, Dokumente, Unterkunftsadressen, private Einträge.
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
          <div className="mt-3"><FollowerPreviewButton /></div>
          <p className="mt-3 text-sm text-slate">Stand der Vorschau: {formatDate(todayIso())} (Demo-Datum der App).</p>
        </Card>
      )}
    </div>
  );
}
