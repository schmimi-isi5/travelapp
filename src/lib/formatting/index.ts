const LOCALE = 'de-DE';

export function formatDate(value: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric' }): string {
  if (!value) return 'unbekannt';
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'unbekannt';
  return new Intl.DateTimeFormat(LOCALE, opts).format(date);
}

export function formatShortDate(value: string | null | undefined): string {
  return formatDate(value, { day: '2-digit', month: 'short' });
}

export function formatDateTime(value: string | null | undefined): string {
  return formatDate(value, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return 'unbekannt';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} Std. ${m} Min.` : `${m} Min.`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD), negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Picks black or white text for a hex background so initials stay AA-readable. */
export function readableTextColor(hex: string): string {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.3 ? '#0F3D4E' : '#FFFFFF';
}
