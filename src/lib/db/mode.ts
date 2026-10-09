export type AppMode = 'demo' | 'supabase';

export interface ModeStatus {
  requested: AppMode;
  effective: AppMode;
  /** Set when supabase was requested but credentials are missing: the app degrades to demo, visibly. */
  notConfiguredReason: string | null;
}

export function getModeStatus(): ModeStatus {
  const requested: AppMode = process.env.NEXT_PUBLIC_APP_MODE === 'supabase' ? 'supabase' : 'demo';
  if (requested === 'demo') return { requested, effective: 'demo', notConfiguredReason: null };
  const missing = [
    !process.env.NEXT_PUBLIC_SUPABASE_URL && 'NEXT_PUBLIC_SUPABASE_URL',
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ].filter(Boolean);
  if (missing.length > 0) return { requested, effective: 'demo', notConfiguredReason: `Fehlende Variablen: ${missing.join(', ')}` };
  return { requested, effective: 'supabase', notConfiguredReason: null };
}
