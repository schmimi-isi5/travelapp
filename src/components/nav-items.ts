import { BedDouble, Mail, BookOpenText, CalendarCheck, CalendarDays, Image as ImageIcon, LayoutDashboard, Map, MoreHorizontal, PawPrint, Plane, Settings, ShieldCheck, Sparkles, Users, Wallet, WifiOff, Archive, Binoculars } from 'lucide-react';
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
  { href: '/route', label: 'Reiseplan', icon: CalendarDays, description: 'Stationen, Fahrtstrecken & Tagesbriefing' },
  { href: '/stays', label: 'Unterkünfte', icon: BedDouble, description: 'Checklisten, Preise & Zahlungen' },
  { href: '/journal', label: 'Tagebuch', icon: BookOpenText, description: 'Unsere gemeinsamen Geschichten' },
  { href: '/gallery', label: 'Galerie', icon: ImageIcon, description: 'Fotos, Videos & Sprachmemos' },
];

export const MORE_NAV: NavItem[] = [
  { href: '/map', label: 'Karte', icon: Map, description: 'Alle Stationen auf der Karte' },
  { href: '/bookings', label: 'Buchungen', icon: Plane, description: 'Flüge, Mietwagen & Aktivitäten' },
  { href: '/guide', label: 'Reiseführer', icon: Sparkles, description: 'Tipps mit Herkunft & Stand' },
  { href: '/sightings', label: 'Safari-Tracker', icon: PawPrint, description: 'Unsere Tiersichtungen' },
  { href: '/mailbox', label: 'Postfach', icon: Mail, description: 'Mails von Unterkünften & Anbietern', roles: ['owner', 'adult'] },
  { href: '/expenses', label: 'Ausgaben', icon: Wallet, description: 'Nach Währung & Kategorie', roles: ['owner', 'adult'] },
  { href: '/safety', label: 'Sicherheit', icon: ShieldCheck, description: 'Notfallkontakte & Dokumente' },
  { href: '/family', label: 'Familie', icon: Users, description: 'Mitglieder, Rollen & Einladungen' },
  { href: '/followers', label: 'Mitreisen', icon: Binoculars, description: 'Privater Link für Daheimgebliebene', roles: ['owner', 'adult'] },
  { href: '/archive', label: 'Erinnerungen', icon: Archive, description: 'Suche & Export' },
  { href: '/offline', label: 'Offline & Sync', icon: WifiOff, description: 'Warteschlange & Konflikte' },
  { href: '/settings', label: 'Einstellungen', icon: Settings, description: 'Profil, KI & Datenschutz' },
];

/** Sidebar order of the design plan; "Mitreisen" lives under Familie and "Erinnerungen" under Galerie (links on those pages). */
const SIDEBAR_ORDER = ['/', '/route', '/map', '/stays', '/bookings', '/journal', '/gallery', '/sightings', '/mailbox', '/expenses', '/safety', '/family', '/guide', '/offline', '/settings'];
const ALL_NAV = [...PRIMARY_NAV, ...MORE_NAV];
export const SIDEBAR_NAV: NavItem[] = SIDEBAR_ORDER.map((href) => ALL_NAV.find((item) => item.href === href)).filter((item): item is NavItem => Boolean(item));

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
