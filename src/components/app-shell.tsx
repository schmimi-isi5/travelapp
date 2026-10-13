'use client';

import clsx from 'clsx';
import { RefreshCw, Search, TriangleAlert, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from './app-provider';
import { AccountMenu, HeaderSearch, NotificationBell } from './app-header';
import { MemberAvatar } from './avatar';
import { SidebarArt } from './sidebar-art';
import { InstallHint, usePersistentStorage } from './install-hint';
import { isActive, MOBILE_TABS, SIDEBAR_NAV, visibleFor } from './nav-items';
import { Badge, Button, Notice, Select, Skeleton } from './ui';
import type { Member } from '@/lib/domain/schemas';

export function FamilyAvatarGroup({ members, size = 36 }: { members: Member[]; size?: number }) {
  return (
    <ul className="flex -space-x-2" aria-label="Familienmitglieder">
      {members.filter((m) => m.status === 'active').map((m) => (
        <li key={m.id} title={`${m.display_name} (${m.role})`}>
          <MemberAvatar member={m} size={size} className="border-2 border-white" />
        </li>
      ))}
    </ul>
  );
}

export function OfflineSyncBanner() {
  const { online, simulatedOffline, pendingCount, conflictCount, syncing, sync } = useApp();
  // A running sync alone is shown by the header indicator; the banner is for things that need attention.
  if (online && pendingCount === 0 && conflictCount === 0) return null;
  return (
    <div role="status" data-testid="sync-banner" className={clsx('flex flex-wrap items-center gap-3 px-4 py-2 text-sm font-medium', !online ? 'bg-ochre-50 text-ochre-700' : conflictCount > 0 ? 'bg-clay-50 text-clay-700' : 'bg-teal-50 text-teal-900')}>
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

function DemoBanner() {
  const { mode, isSupabase } = useApp();
  if (isSupabase) return null;
  return (
    <div data-testid="demo-banner" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-deep px-4 py-2 text-center text-sm text-white">
      <Badge tone="demo" className="bg-gold text-deep">DEMO-MODUS</Badge>
      <span>Alle Stationen, Unterkünfte, Beträge und Profile sind fiktiv. Keine echte Buchung oder Zahlung.</span>
      {mode.notConfiguredReason && <span className="opacity-90">Live-Konto: nicht eingerichtet ({mode.notConfiguredReason}).</span>}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, error, members, currentUser, switchUser, role, isSupabase } = useApp();
  const sideItems = visibleFor(SIDEBAR_NAV, role);
  usePersistentStorage(ready && isSupabase);

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-50 rounded bg-white px-3 py-2 font-semibold text-deep">
        Zum Inhalt springen
      </a>
      <DemoBanner />
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 md:px-6">
          <Link href="/" className="flex min-w-0 shrink items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon.svg" alt="" width={36} height={36} className="shrink-0 rounded-lg" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-lg font-bold text-deep">Namibia & Botswana</span>
              <span className="hidden text-xs font-semibold uppercase tracking-wider text-muted sm:block">Unsere Reise. Unsere Geschichte.</span>
            </span>
          </Link>
          <HeaderSearch className="mx-auto hidden w-full max-w-xl md:block" />
          <div className="ml-auto flex items-center gap-1 md:ml-0 md:gap-2">
            <Link href="/archive" aria-label="Suchen" className="grid size-11 place-items-center rounded-full text-deep hover:bg-sand-50 md:hidden"><Search size={22} aria-hidden /></Link>
            <NotificationBell />
            {isSupabase && <AccountMenu />}
            {!isSupabase && currentUser && (
              <>
                <div className="hidden sm:block"><FamilyAvatarGroup members={members} size={32} /></div>
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
              </>
            )}
          </div>
        </div>
        <OfflineSyncBanner />
      </header>

      <div className="mx-auto flex max-w-[1440px]">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-line p-4 lg:flex">
          <nav aria-label="Hauptnavigation">
            <ul className="space-y-1">
              {sideItems.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined} className={clsx('flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold', isActive(pathname, item.href) ? 'bg-deep text-white' : 'text-slate hover:bg-sand-50')}>
                    <item.icon size={18} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <SidebarArt />
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
            <>
              <InstallHint />
              {children}
            </>
          )}
        </main>
      </div>

      <nav aria-label="Tab-Leiste" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[var(--safe-bottom)] lg:hidden">
        <ul className="grid grid-cols-5">
          {MOBILE_TABS.map((item) => (
            <li key={item.href}>
              <Link href={item.href} aria-current={isActive(pathname, item.href) ? 'page' : undefined} className={clsx('flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold', isActive(pathname, item.href) ? 'text-deep' : 'text-muted')}>
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
