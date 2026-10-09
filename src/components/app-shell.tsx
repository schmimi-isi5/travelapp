'use client';

import clsx from 'clsx';
import { RefreshCw, TriangleAlert, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './app-provider';
import { isActive, MOBILE_TABS, MORE_NAV, PRIMARY_NAV, visibleFor } from './nav-items';
import { useState } from 'react';
import { Badge, Button, ConfirmationDialog, Notice, Select, Skeleton } from './ui';
import type { Member } from '@/lib/domain/schemas';
import { readableTextColor } from '@/lib/formatting';

/** Two letters for the avatar: first letters of the first two words, or the first two letters of a single word. */
export function initials(name: string): string {
  const words = name.replace('Demo-', '').split(/[\s._-]+/).filter(Boolean);
  const letters = words.length >= 2 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

export function FamilyAvatarGroup({ members, size = 36 }: { members: Member[]; size?: number }) {
  return (
    <ul className="flex -space-x-2" aria-label="Familienmitglieder">
      {members.filter((m) => m.status === 'active').map((m) => (
        <li key={m.id} title={`${m.display_name} (${m.role})`} className="grid place-items-center rounded-full border-2 border-white text-xs font-bold" style={{ width: size, height: size, background: m.avatar_color, color: readableTextColor(m.avatar_color) }}>
          <span aria-hidden>{initials(m.display_name)}</span>
          <span className="sr-only">{m.display_name}</span>
        </li>
      ))}
    </ul>
  );
}

export function OfflineSyncBanner() {
  const { online, simulatedOffline, pendingCount, conflictCount, syncing, sync } = useApp();
  if (online && pendingCount === 0 && conflictCount === 0 && !syncing) return null;
  return (
    <div role="status" data-testid="sync-banner" className={clsx('flex flex-wrap items-center gap-3 px-4 py-2 text-sm font-medium', !online ? 'bg-amber-100 text-amber-950' : conflictCount > 0 ? 'bg-red-100 text-red-950' : 'bg-blue-100 text-blue-950')}>
      {!online ? <WifiOff size={16} aria-hidden /> : conflictCount > 0 ? <TriangleAlert size={16} aria-hidden /> : <RefreshCw size={16} aria-hidden className={syncing ? 'animate-spin' : ''} />}
      <span>
        {!online ? `Offline${simulatedOffline ? ' (simuliert)' : ''}: Änderungen werden lokal gespeichert.` : syncing ? 'Synchronisiere …' : conflictCount > 0 ? 'Synchronisationskonflikt: bitte entscheiden.' : 'Änderungen warten auf Synchronisation.'}
      </span>
      {pendingCount > 0 && <Badge tone="warn">{pendingCount} in Warteschlange</Badge>}
      {conflictCount > 0 && (
        <Link href="/offline" className="underline">
          {conflictCount} Konflikt{conflictCount > 1 ? 'e' : ''} lösen
        </Link>
      )}
      {online && pendingCount > 0 && !syncing && (
        <Button size="sm" variant="secondary" onClick={() => void sync()}>
          Jetzt synchronisieren
        </Button>
      )}
    </div>
  );
}

export function AccountMenu() {
  const { currentUser, userEmail, role, signOut } = useApp();
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
    <div className="flex items-center gap-2">
      <span className="hidden text-right text-sm leading-tight sm:block" data-testid="account-name">
        <span className="block font-semibold">{currentUser?.display_name ?? userEmail}</span>
        <span className="block text-xs text-muted">{role}</span>
      </span>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void logout(false)}>Abmelden</Button>
      <ConfirmationDialog
        open={pending !== null}
        title="Nicht synchronisierte Änderungen"
        message={`Es gibt ${pending} Änderung(en), die noch nicht auf den Server übertragen wurden (offline, Konflikt oder Fehler). Beim Abmelden werden die lokalen Daten dieses Geräts gelöscht und diese Änderungen gehen verloren.`}
        confirmLabel="Trotzdem abmelden"
        onCancel={() => setPending(null)}
        onConfirm={() => void logout(true)}
      />
    </div>
  );
}

function DemoBanner() {
  const { mode, isSupabase } = useApp();
  if (isSupabase) return null;
  return (
    <div data-testid="demo-banner" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-deep px-4 py-2 text-center text-sm text-white">
      <Badge tone="demo" className="bg-gold text-deep">DEMO-MODUS</Badge>
      <span>Alle Stationen, Unterkünfte, Beträge und Profile sind fiktiv. Keine echte Buchung oder Zahlung.</span>
      {mode.notConfiguredReason && <span className="opacity-90">Supabase: nicht konfiguriert ({mode.notConfiguredReason}).</span>}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, error, members, currentUser, switchUser, role, isSupabase } = useApp();
  const sideItems = [...visibleFor(PRIMARY_NAV, role), ...visibleFor(MORE_NAV, role)];

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-50 rounded bg-white px-3 py-2 font-semibold text-deep">
        Zum Inhalt springen
      </a>
      <DemoBanner />
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-3 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon.svg" alt="" width={36} height={36} className="rounded-lg" />
            <span className="leading-tight">
              <span className="block text-lg font-extrabold text-deep">Namibia & Botswana</span>
              <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-muted sm:block">Unsere Reise. Unsere Geschichte.</span>
            </span>
          </Link>
          <nav aria-label="Hauptnavigation" className="hidden items-center gap-1 lg:flex">
            {visibleFor(PRIMARY_NAV, role).map((item) => (
              <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined} className={clsx('rounded-full px-4 py-2 text-sm font-semibold', isActive(pathname, item.href) ? 'bg-deep text-white' : 'text-slate hover:bg-sand')}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <FamilyAvatarGroup members={members} size={32} />
            {isSupabase && <div className="hidden sm:block"><AccountMenu /></div>}
            {!isSupabase && currentUser && (
              <label className="hidden items-center gap-2 text-sm sm:flex">
                <span className="sr-only">Angemeldet als</span>
                <Select aria-label="Profil wechseln (Demo)" value={currentUser.id} onChange={(e) => switchUser(e.target.value)} className="min-h-10 py-1.5 text-sm">
                  {members.filter((m) => m.status === 'active').map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name} ({m.role})
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </div>
        </div>
        <OfflineSyncBanner />
      </header>

      <div className="mx-auto flex max-w-[1440px]">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-line p-4 lg:block">
          <nav aria-label="Seitennavigation">
            <ul className="space-y-1">
              {sideItems.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined} className={clsx('flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold', isActive(pathname, item.href) ? 'bg-deep-50 text-deep' : 'text-slate hover:bg-sand')}>
                    <item.icon size={18} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-8 lg:pb-12">
          {error ? (
            <Notice tone="danger" title="Lokale Datenbank nicht verfügbar">
              {error}. Private Browserfenster oder blockierter Speicher verhindern den Betrieb.
            </Notice>
          ) : !ready ? (
            <div className="space-y-4" aria-busy="true" aria-label="Lädt">
              <Skeleton className="h-10 w-1/2" />
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      <nav aria-label="Tab-Leiste" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[var(--safe-bottom)] lg:hidden">
        <ul className="grid grid-cols-5">
          {MOBILE_TABS.map((item) => (
            <li key={item.href}>
              <Link href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined} className={clsx('flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive(pathname, item.href) ? 'text-deep' : 'text-muted')}>
                <item.icon size={22} aria-hidden strokeWidth={isActive(pathname, item.href) ? 2.5 : 2} />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
