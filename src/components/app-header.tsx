'use client';

import clsx from 'clsx';
import { Bell, ChevronDown, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './app-provider';
import { MemberAvatar } from './avatar';
import { Button, ConfirmationDialog } from './ui';
import { useTable } from '@/lib/db/hooks';
import { buildNotifications, type AppNotification } from '@/lib/domain/notifications';
import { roleLabel } from '@/lib/labels';

const READ_KEY = 'nb-notifications-read-v1';
const MAX_REMEMBERED = 200;

/** Quiet sync status (read-only view of the sync state): a dot plus a short word. */
export function SyncIndicator() {
  const { online, pendingCount, conflictCount, syncing } = useApp();
  const state = !online ? { label: 'Offline', dot: 'bg-ochre-700' } : conflictCount > 0 ? { label: 'Konflikt', dot: 'bg-clay-700' } : syncing ? { label: 'Synchronisiert …', dot: 'bg-teal-700 animate-pulse' } : pendingCount > 0 ? { label: `${pendingCount} offen`, dot: 'bg-ochre-700' } : { label: 'Aktuell', dot: 'bg-savanna-700' };
  return (
    <span role="status" data-testid="sync-indicator" className="flex items-center gap-1.5 text-xs font-semibold text-muted">
      <span aria-hidden className={clsx('size-2.5 rounded-full', state.dot)} />
      <span>{state.label}</span>
    </span>
  );
}

/** Closes a popover on Escape and on a click outside of it. */
function useDismiss(isOpen: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
    const onClick = (event: MouseEvent) => ref.current && !ref.current.contains(event.target as Node) && close();
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [isOpen, close]);
  return ref;
}

/** Header search: hands the text to the archive search (journal, sightings, places, accommodation, tips, bookings). */
export function HeaderSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  return (
    <form
      role="search"
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        router.push(text.trim() ? `/archive?q=${encodeURIComponent(text.trim())}` : '/archive');
        setText('');
      }}
    >
      <div className="relative">
        <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input aria-label="Suche" type="search" value={text} onChange={(event) => setText(event.target.value)} placeholder="Suche nach Orten, Unterkünften, Aktivitäten …" className="min-h-11 w-full rounded-full border border-line bg-sand-50 pl-10 pr-4 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep" />
      </div>
    </form>
  );
}

function readDismissed(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(READ_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

const SEVERITY_DOT = { critical: 'bg-clay-500', warning: 'bg-gold-500', info: 'bg-teal-700' } as const;
const SEVERITY_TEXT = { critical: 'dringend', warning: 'bald fällig', info: 'Hinweis' } as const;

/** Bell with the notices derived from the data on the device: deadlines, overdue tasks, sync conflicts. */
export function NotificationBell() {
  const { today, role, conflictCount, pendingCount } = useApp();
  const items = useTable('action_items').rows;
  const stays = useTable('stays').rows;
  const bookings = useTable('bookings').rows;
  const [isOpen, setIsOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const ref = useDismiss(isOpen, () => setIsOpen(false));

  useEffect(() => setDismissed(readDismissed()), []);
  const all = useMemo(() => buildNotifications({ today, role, items, stays, bookings, conflictCount, pendingCount }), [today, role, items, stays, bookings, conflictCount, pendingCount]);
  const unread = all.filter((n) => !dismissed.includes(n.id));

  function markAllRead() {
    const next = [...new Set([...dismissed, ...all.map((n) => n.id)])].slice(-MAX_REMEMBERED);
    setDismissed(next);
    try {
      window.localStorage.setItem(READ_KEY, JSON.stringify(next));
    } catch {
      /* not persisted: the notices simply show up again */
    }
  }

  const row = (n: AppNotification) => (
    <li key={n.id} className="border-t border-line first:border-t-0">
      <Link href={n.href} onClick={() => setIsOpen(false)} className="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-sand-50">
        <span aria-hidden className={clsx('mt-1.5 size-2.5 shrink-0 rounded-full', SEVERITY_DOT[n.severity])} />
        <span className="min-w-0 text-sm">
          <span className="sr-only">{SEVERITY_TEXT[n.severity]}: </span>
          <strong className="block truncate">{n.title}</strong>
          <span className="text-slate">{n.detail}</span>
        </span>
      </Link>
    </li>
  );

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="dialog" aria-expanded={isOpen} aria-label={unread.length ? `Benachrichtigungen, ${unread.length} ungelesen` : 'Benachrichtigungen'} onClick={() => setIsOpen((value) => !value)} data-testid="notification-bell" className="relative grid size-11 place-items-center rounded-full text-deep hover:bg-sand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep">
        <Bell size={22} aria-hidden />
        {unread.length > 0 && <span aria-hidden className="absolute right-1.5 top-1.5 grid min-w-5 place-items-center rounded-full bg-clay-500 px-1 text-xs font-bold text-white">{unread.length}</span>}
      </button>
      {isOpen && (
        <div role="dialog" aria-label="Benachrichtigungen" className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-white shadow-card">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <h2 className="text-base font-bold">Benachrichtigungen</h2>
            {unread.length > 0 && <button type="button" onClick={markAllRead} className="min-h-11 text-sm font-semibold text-deep underline">Alle gelesen</button>}
          </div>
          {all.length === 0 ? <p className="border-t border-line px-4 py-4 text-sm text-slate">Nichts Dringendes. Fristen und Synchronisationsprobleme erscheinen hier.</p> : <ul className="max-h-96 overflow-y-auto" data-testid="notification-list">{all.map(row)}</ul>}
        </div>
      )}
    </div>
  );
}

/** Sign-out with the warning for changes that have not reached the server yet. */
export function SignOutButton({ variant = 'secondary', className }: { variant?: 'secondary' | 'ghost'; className?: string }) {
  const { signOut } = useApp();
  const [pending, setPending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function logout(discard: boolean) {
    setBusy(true);
    try {
      const result = await signOut({ discardUnsynced: discard });
      setPending(result.ok ? null : result.pending);
    } catch (cause) {
      setPending(null);
      window.alert(`Abmelden war nicht vollständig: ${cause instanceof Error ? cause.message : String(cause)}. Bitte schließe alle anderen Tabs dieser App und versuche es erneut.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant={variant} className={className} disabled={busy} onClick={() => void logout(false)}>Abmelden</Button>
      <ConfirmationDialog
        open={pending !== null}
        title="Nicht synchronisierte Änderungen"
        message={`Es gibt ${pending} Änderung(en), die noch nicht auf den Server übertragen wurden (offline, Konflikt oder Fehler). Beim Abmelden werden die lokalen Daten dieses Geräts gelöscht und diese Änderungen gehen verloren.`}
        confirmLabel="Trotzdem abmelden"
        onCancel={() => setPending(null)}
        onConfirm={() => void logout(true)}
      />
    </>
  );
}

/** Profile menu: photo, name and role; sync status, link to the profile settings and sign-out inside. */
export function AccountMenu() {
  const { currentUser, userEmail, role } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useDismiss(isOpen, () => setIsOpen(false));
  const name = currentUser?.display_name ?? userEmail ?? 'Konto';
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={isOpen} aria-label={`Profilmenü von ${name}`} onClick={() => setIsOpen((value) => !value)} data-testid="account-menu" className="flex min-h-11 items-center gap-2 rounded-full hover:bg-sand-50 md:pr-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep">
        {currentUser ? <MemberAvatar member={currentUser} size={40} /> : <span className="size-10 rounded-full bg-sand" aria-hidden />}
        <span className="hidden text-left text-sm leading-tight md:block" data-testid="account-name">
          <span className="block font-semibold">{name}</span>
          <span className="block text-xs text-muted">{roleLabel[role]}</span>
        </span>
        <ChevronDown size={16} aria-hidden className="hidden text-muted md:block" />
      </button>
      {isOpen && (
        <div role="menu" aria-label="Profil" className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-line bg-white p-2 shadow-card">
          <p className="px-3 py-2 text-sm"><strong className="block">{name}</strong><span className="text-muted">{roleLabel[role]}</span></p>
          <div className="border-t border-line px-3 py-2"><SyncIndicator /></div>
          <Link role="menuitem" href="/settings" onClick={() => setIsOpen(false)} className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold hover:bg-sand-50">Mein Profil und Einstellungen</Link>
          <Link role="menuitem" href="/offline" onClick={() => setIsOpen(false)} className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold hover:bg-sand-50">Offline &amp; Sync</Link>
          <div className="border-t border-line px-3 pt-2 pb-1"><SignOutButton className="w-full" /></div>
        </div>
      )}
    </div>
  );
}
