'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useApp } from './app-provider';
import { Skeleton } from './ui';

/**
 * Keeps the app behind a session in Supabase mode. Demo mode renders its children directly.
 * Unsynced local data is untouched while signed out; it stays locked until the same user signs in again.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isSupabase, authStatus, hasTrip, hydrating, online, lastSync } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isSupabase) return;
    if (authStatus === 'signed_out') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (authStatus === 'no_family' || (authStatus === 'ready' && !hasTrip)) router.replace('/setup');
  }, [isSupabase, authStatus, hasTrip, pathname, router]);

  if (isSupabase && authStatus === 'ready' && hasTrip && hydrating) {
    const failed = lastSync !== null && lastSync.errors.length > 0;
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6" aria-busy={!failed} data-testid="hydrating">
        <h1 className="text-xl font-bold">{online ? 'Daten werden geladen …' : 'Keine Verbindung'}</h1>
        <p className="text-slate">{!online ? 'Beim ersten Start auf diesem Gerät ist eine Internetverbindung nötig, um die Familiendaten zu laden.' : failed ? `Die Daten konnten nicht geladen werden: ${lastSync?.errors[0]}` : 'Die Familiendaten werden einmalig auf dieses Gerät übertragen.'}</p>
        {!failed && <Skeleton className="h-40 w-full" />}
      </div>
    );
  }
  if (!isSupabase || (authStatus === 'ready' && hasTrip)) return <>{children}</>;
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label="Anmeldung wird geprüft">
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
