'use client';

import type { Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getActor, setActor } from '@/lib/db/actor';
import { DEMO_FAMILY_ID, DEMO_TRIP_ID, DEMO_USERS } from '@/lib/db/demo-data';
import { getDeviceId } from '@/lib/db/ids';
import { DEMO_DB_NAME, deleteForeignUserDatabases, deleteLocalDatabase, getLocalDb, selectLocalDatabase, USER_DB_PREFIX } from '@/lib/db/local';
import { getModeStatus, type ModeStatus } from '@/lib/db/mode';
import { ensureSeeded } from '@/lib/db/seed';
import { isAdult } from '@/lib/domain/policy';
import type { Member, Role } from '@/lib/domain/schemas';
import { todayIso } from '@/lib/formatting';
import { isOnline, isSimulatedOffline, setSimulatedOffline, subscribeNetwork } from '@/lib/offline/network';
import type { RemoteAdapter } from '@/lib/offline/remote';
import { DemoRemote } from '@/lib/offline/remote-demo';
import { SupabaseRemote } from '@/lib/offline/remote-supabase';
import { isSyncRunning, subscribeSync, syncNow, type SyncSummary } from '@/lib/offline/sync';
import { getSupabase } from '@/lib/supabase/client';

const USER_KEY = 'nb-current-user';
const TODAY_KEY = 'nb-demo-today';
const MEMBERSHIP_META = 'membership';
const PERIODIC_SYNC_MS = 60_000;
/** A slow or unreachable server must not keep the app on the loading screen: fall back to the cached membership. */
const MEMBERSHIP_TIMEOUT_MS = 6000;

export type AuthStatus = 'demo' | 'loading' | 'signed_out' | 'no_family' | 'ready';

interface Membership {
  familyId: string;
  tripId: string | null;
  role: Role;
}

export interface SignOutResult {
  ok: boolean;
  /** Unsynced local changes that block a clean sign-out. */
  pending: number;
}

interface AppState {
  ready: boolean;
  error: string | null;
  mode: ModeStatus;
  isSupabase: boolean;
  authStatus: AuthStatus;
  userEmail: string | null;
  familyId: string;
  tripId: string;
  hasTrip: boolean;
  /** First start on this device: nothing has been pulled yet, so empty lists would be misleading. */
  hydrating: boolean;
  members: Member[];
  currentUser: Member | null;
  role: Role;
  switchUser: (id: string) => void;
  signOut: (options?: { discardUnsynced?: boolean }) => Promise<SignOutResult>;
  /** Re-reads family membership after setup or accepting an invitation. */
  refreshMembership: () => Promise<void>;
  today: string;
  setDemoToday: (value: string | null) => void;
  hasDemoDateOverride: boolean;
  online: boolean;
  simulatedOffline: boolean;
  setOffline: (value: boolean) => void;
  pendingCount: number;
  conflictCount: number;
  syncing: boolean;
  lastSync: SyncSummary | null;
  sync: () => Promise<SyncSummary>;
  remote: RemoteAdapter;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp muss innerhalb von AppProvider verwendet werden');
  return ctx;
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function clearAppStorage(): void {
  try {
    for (const key of Object.keys(window.localStorage)) if (key.startsWith('nb-') && key !== 'nb-device-id') window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const mode = useMemo(() => getModeStatus(), []);
  const isSupabase = mode.effective === 'supabase';
  const demoRemote = useMemo<RemoteAdapter>(() => new DemoRemote(), []);
  const [supabaseRemote, setSupabaseRemote] = useState<RemoteAdapter | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>(isSupabase ? 'loading' : 'demo');
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [currentId, setCurrentId] = useState<string>(DEMO_USERS.ownerA);
  const [todayOverride, setTodayOverride] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<SyncSummary | null>(null);
  const [neverSynced, setNeverSynced] = useState(false);
  const membershipRef = useRef<Membership | null>(null);
  // True while an intentional sign-out cleans up: the auth event must not redirect before the local data is gone.
  const signingOutRef = useRef(false);

  const online = useSyncExternalStore(subscribeNetwork, isOnline, () => true);
  const simulatedOffline = useSyncExternalStore(subscribeNetwork, isSimulatedOffline, () => false);
  const syncing = useSyncExternalStore(subscribeSync, isSyncRunning, () => false);

  const remote = isSupabase ? (supabaseRemote ?? demoRemote) : demoRemote;

  // ---------------------------------------------------------------- demo boot
  useEffect(() => {
    if (isSupabase) return;
    let cancelled = false;
    (async () => {
      try {
        await ensureSeeded();
        if (cancelled) return;
        const stored = readStored(USER_KEY);
        if (stored) setCurrentId(stored);
        setTodayOverride(readStored(TODAY_KEY));
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSupabase]);

  // ------------------------------------------------------------ supabase boot
  const resolveMembership = useCallback(async (userId: string): Promise<Membership | null> => {
    const db = getLocalDb();
    const supabase = getSupabase();
    const cached = (await db.meta.get(MEMBERSHIP_META))?.value as Membership | undefined;
    // Offline start: the last known membership is enough and avoids waiting for the client's network retries.
    if (cached && !isOnline()) return cached;
    try {
      const { data: rows, error: memberError } = await supabase.from('family_members').select('family_id, role').eq('user_id', userId).eq('status', 'active').limit(1).abortSignal(AbortSignal.timeout(MEMBERSHIP_TIMEOUT_MS));
      if (memberError) throw memberError;
      const row = rows?.[0] as { family_id: string; role: Role } | undefined;
      if (!row) {
        await db.meta.delete(MEMBERSHIP_META);
        return null;
      }
      const { data: trips } = await supabase.from('trips').select('id').eq('family_id', row.family_id).order('created_at').limit(1).abortSignal(AbortSignal.timeout(MEMBERSHIP_TIMEOUT_MS));
      const found: Membership = { familyId: row.family_id, tripId: (trips?.[0] as { id: string } | undefined)?.id ?? null, role: row.role };
      await db.meta.put({ key: MEMBERSHIP_META, value: found });
      return found;
    } catch (cause) {
      // Offline or server unreachable: continue with the last known membership of this user on this device.
      if (cached) return cached;
      throw cause;
    }
  }, []);

  const bootUser = useCallback(
    async (active: Session) => {
      const userId = active.user.id;
      try {
        const dbName = `${USER_DB_PREFIX}${userId}`;
        await deleteForeignUserDatabases(dbName);
        selectLocalDatabase(dbName);
        const found = await resolveMembership(userId);
        membershipRef.current = found;
        setMembership(found);
        if (!found) {
          setAuthStatus('no_family');
          setReady(false);
          return;
        }
        setActor({ userId, role: found.role });
        setSupabaseRemote(
          new SupabaseRemote(getSupabase(), {
            familyId: found.familyId,
            userId,
            deviceId: getDeviceId(),
            isAdult: () => isAdult(getActor().role),
          }),
        );
        setNeverSynced((await getLocalDb().sync_meta.count()) === 0);
        setAuthStatus('ready');
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [resolveMembership],
  );

  useEffect(() => {
    if (!isSupabase) return;
    const supabase = getSupabase();
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) void bootUser(data.session);
      else setAuthStatus('signed_out');
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') router.replace('/auth/update-password');
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setSession(next);
        return;
      }
      if (event === 'SIGNED_IN') {
        setSession((prev) => {
          if (prev?.user.id === next?.user.id) return next;
          if (next) void bootUser(next);
          return next;
        });
      }
      if (event === 'SIGNED_OUT' && !signingOutRef.current) {
        // Session ended (expired refresh token or explicit sign-out): lock the UI but keep unsynced local data.
        setSession(null);
        setReady(false);
        setAuthStatus('signed_out');
      }
    });
    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [isSupabase, bootUser, router]);

  // Reads the session from the client instead of component state: callers (invite/setup pages) run right after
  // sign-in, before React has re-rendered with the new session.
  const refreshMembership = useCallback(async () => {
    const { data } = await getSupabase().auth.getSession();
    if (data.session) await bootUser(data.session);
  }, [bootUser]);

  // ------------------------------------------------------------------ data
  const members = useLiveQuery(() => getLocalDb().entity('members').toArray(), [ready, authStatus], []) as Member[];
  const activeUserId = isSupabase ? (session?.user.id ?? null) : currentId;
  // Until the first sync has delivered the member list, the signed-in user is represented by their session.
  const sessionUser: Member | null =
    isSupabase && session && membership
      ? {
          id: session.user.id,
          family_id: membership.familyId,
          display_name: (session.user.user_metadata?.display_name as string | undefined) ?? session.user.email?.split('@')[0] ?? 'Ich',
          role: membership.role,
          status: 'active',
          avatar_color: '#0F3D4E',
          version: 1,
          created_at: session.user.created_at,
          updated_at: session.user.created_at,
          created_by: null,
          is_demo: false,
          source_type: 'user_entered',
        }
      : null;
  const currentUser = members.find((m) => m.id === activeUserId) ?? (isSupabase ? sessionUser : (members.find((m) => m.status === 'active') ?? null));
  const role: Role = currentUser?.role ?? (isSupabase ? (membership?.role ?? 'child') : 'child');
  if (isSupabase) {
    if (session && ready) setActor({ userId: session.user.id, role });
  } else if (currentUser) {
    setActor({ userId: currentUser.id, role });
  }

  const pendingCount = useLiveQuery(() => getLocalDb().sync_mutations.where('status').equals('pending').count(), [ready, authStatus], 0) ?? 0;
  const conflictCount = useLiveQuery(() => getLocalDb().sync_conflicts.filter((c) => !c.resolved_at).count(), [ready, authStatus], 0) ?? 0;

  const sync = useCallback(async () => {
    const summary = await syncNow(remote);
    setLastSync(summary);
    if (!summary.skipped && summary.errors.length === 0) setNeverSynced(false);
    if (summary.authRequired && isSupabase) {
      // Try to renew the session once; if that fails the UI locks, local changes stay queued for the next sign-in.
      const { error: refreshError } = await getSupabase().auth.refreshSession();
      if (refreshError) {
        setSession(null);
        setReady(false);
        setAuthStatus('signed_out');
      }
    }
    return summary;
  }, [remote, isSupabase]);

  // Reconnecting, regaining focus and a slow timer all trigger a sync; every run is idempotent.
  const canSync = ready && (!isSupabase || (authStatus === 'ready' && supabaseRemote !== null));
  useEffect(() => {
    if (canSync && online) void sync();
  }, [canSync, online, sync]);
  useEffect(() => {
    if (!canSync) return;
    const onVisible = () => document.visibilityState === 'visible' && isOnline() && void sync();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(onVisible, PERIODIC_SYNC_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [canSync, sync]);

  // New local changes are sent shortly after they happen. After a failed run only the periodic timer retries,
  // so a persistent error cannot turn into a request loop.
  const lastRunFailed = lastSync !== null && (lastSync.failed > 0 || lastSync.authRequired);
  useEffect(() => {
    if (!canSync || !online || syncing || pendingCount === 0 || lastRunFailed) return;
    const timer = setTimeout(() => void sync(), 800);
    return () => clearTimeout(timer);
  }, [canSync, online, syncing, pendingCount, lastRunFailed, sync]);

  // Service worker: production only, so dev hot reload is never cached.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((e) => console.warn(JSON.stringify({ level: 'warn', message: 'service worker registration failed', detail: String(e) })));
    }
  }, []);

  const switchUser = useCallback((id: string) => {
    setCurrentId(id);
    try {
      window.localStorage.setItem(USER_KEY, id);
    } catch {
      /* ignore: selection just isn't remembered */
    }
  }, []);

  const setDemoToday = useCallback((value: string | null) => {
    setTodayOverride(value);
    try {
      if (value) window.localStorage.setItem(TODAY_KEY, value);
      else window.localStorage.removeItem(TODAY_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const signOut = useCallback(
    async (options: { discardUnsynced?: boolean } = {}): Promise<SignOutResult> => {
      if (!isSupabase) return { ok: true, pending: 0 };
      const db = getLocalDb();
      if (!options.discardUnsynced) {
        if (isOnline()) await sync();
        const pending = await db.sync_mutations.filter((m) => m.status === 'pending' || m.status === 'conflict').count();
        if (pending > 0) return { ok: false, pending };
      }
      const supabase = getSupabase();
      const userId = session?.user.id;
      // Lock the UI (skeleton, no redirect yet) and ignore the auth event until the local data is removed, so the
      // login page only appears once nothing of this user is left on the device.
      signingOutRef.current = true;
      setReady(false);
      try {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) await supabase.auth.signOut({ scope: 'local' });
        if (userId) await deleteLocalDatabase(`${USER_DB_PREFIX}${userId}`);
        selectLocalDatabase(DEMO_DB_NAME);
        clearAppStorage();
        setSession(null);
        setMembership(null);
        setSupabaseRemote(null);
      } finally {
        signingOutRef.current = false;
      }
      setAuthStatus('signed_out');
      router.replace('/login');
      return { ok: true, pending: 0 };
    },
    [isSupabase, session, sync, router],
  );

  const value: AppState = {
    ready,
    error,
    mode,
    isSupabase,
    authStatus,
    userEmail: session?.user.email ?? null,
    familyId: isSupabase ? (membership?.familyId ?? '') : DEMO_FAMILY_ID,
    tripId: isSupabase ? (membership?.tripId ?? '') : DEMO_TRIP_ID,
    hasTrip: isSupabase ? Boolean(membership?.tripId) : true,
    hydrating: isSupabase && neverSynced,
    members,
    currentUser,
    role,
    switchUser,
    signOut,
    refreshMembership,
    today: todayOverride ?? todayIso(),
    setDemoToday,
    hasDemoDateOverride: todayOverride !== null,
    online,
    simulatedOffline,
    setOffline: setSimulatedOffline,
    pendingCount,
    conflictCount,
    syncing,
    lastSync,
    sync,
    remote,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
