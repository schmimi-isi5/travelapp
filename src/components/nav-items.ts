import { BedDouble, BookOpenText, CalendarCheck, Image as ImageIcon, LayoutDashboard, Map, MoreHorizontal, PawPrint, Plane, Settings, ShieldCheck, Sparkles, Users, Wallet, WifiOff, Archive } from 'lucide-react';
import type { Role } from '@/lib/domain/schemas';

export interface NavItem {
  href: string;
  label: string;
  icon: typeof Map;
  description: string;
  /** Roles that may see this entry. Absent = everyone. */
  roles?: Role[];
}

export const PRIMARY_NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, description: 'Dein nächster Reisetag' },
  { href: '/route', label: 'Route', icon: Map, description: 'Stationen, Karte & Tagesbriefing' },
  { href: '/stays', label: 'Unterkünfte', icon: BedDouble, description: 'Checklisten, Preise & Zahlungen' },
  { href: '/journal', label: 'Tagebuch', icon: BookOpenText, description: 'Unsere gemeinsamen Geschichten' },
  { href: '/gallery', label: 'Galerie', icon: ImageIcon, description: 'Fotos, Videos & Sprachmemos' },
];

export const MORE_NAV: NavItem[] = [
  { href: '/bookings', label: 'Buchungen', icon: Plane, description: 'Flüge, Mietwagen & Aktivitäten' },
  { href: '/guide', label: 'KI-Guide', icon: Sparkles, description: 'Tipps mit Herkunft & Stand' },
  { href: '/sightings', label: 'Safari-Tracker', icon: PawPrint, description: 'Unsere Tiersichtungen' },
  { href: '/expenses', label: 'Ausgaben', icon: Wallet, description: 'Nach Währung & Kategorie', roles: ['owner', 'adult'] },
  { href: '/safety', label: 'Sicherheit', icon: ShieldCheck, description: 'Notfallkontakte & Dokumente' },
  { href: '/family', label: 'Familie', icon: Users, description: 'Mitglieder, Rollen & Einladungen' },
  { href: '/archive', label: 'Erinnerungen', icon: Archive, description: 'Suche & Export' },
  { href: '/offline', label: 'Offline & Sync', icon: WifiOff, description: 'Warteschlange & Konflikte' },
  { href: '/settings', label: 'Einstellungen', icon: Settings, description: 'Demo, KI & Datenschutz' },
];

export const MOBILE_TABS: NavItem[] = [
  PRIMARY_NAV[0]!,
  PRIMARY_NAV[1]!,
  PRIMARY_NAV[2]!,
  PRIMARY_NAV[3]!,
  { href: '/more', label: 'Mehr', icon: MoreHorizontal, description: 'Alle Module' },
];

export const CALENDAR_ICON = CalendarCheck;

export function visibleFor(items: NavItem[], role: Role): NavItem[] {
  return items.filter((item) => !item.roles || item.roles.includes(role));
}

export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
