'use client';

import clsx from 'clsx';
import { ArrowRight, BedDouble, BookOpenText, Car, CircleCheck, FileText, Image as ImageIcon, PawPrint, Plane, Plus, ShieldCheck, ShoppingBasket, Sparkles, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { MemberAvatar } from '@/components/avatar';
import { Scene } from '@/components/scene';
import { ResponsiveTravelImage } from '@/components/destination-image';
import { IllustratedTripMap, type IllustratedStop } from '@/components/trip-map-illustrated';
import { Card } from '@/components/ui';
import { AddActionForm } from '@/features/common/action-checklist';
import { useStopImages } from '@/features/media/use-destination-library';
import { sceneForStop } from '@/features/trip/stop-card';
import { roleLabel, driveSummary } from '@/lib/labels';
import { isAdult } from '@/lib/domain/policy';
import type { ActionItem, Booking, Member, Role, Route, Stay, Trip, TripStop } from '@/lib/domain/schemas';
import { daysBetween, formatDate, formatShortDate } from '@/lib/formatting';
import { imagesForStop, imageUrl, placeKeyForStop, type DestinationImage } from '@/lib/media/places';

export const REGION_COUNTRIES = ['Namibia', 'Botswana'];
const TASKS_COLLAPSED = 4;
const IMPRESSIONS_MAX = 4;
const SOON_TASK_DAYS = 7;

function CardHeading({ id, title, action }: { id: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="font-display text-xl font-bold md:text-2xl">{title}</h2>
      {action}
    </div>
  );
}

const textLink = 'inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-deep underline';

// ---------------------------------------------------------------- next stop

function InfoRow({ icon: Icon, label, children }: { icon: typeof Plane; label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-sand-50 text-deep"><Icon size={20} aria-hidden /></span>
      <div className="min-w-0 text-sm">
        <p className="text-xs text-muted">{label}</p>
        {children}
      </div>
    </li>
  );
}

const placeName = (stop: Pick<TripStop, 'title'>) => stop.title.split('/').pop()?.trim() ?? stop.title;
/** Short name for the photo overlay: no "Anreise:" prefix and no bracketed country. */
const overlayTitle = (stop: Pick<TripStop, 'title'>) => placeName(stop).replace(/^Anreise:\s*/i, '').replace(/\s*\([^)]*\)/g, '').trim();
const timeOf = (iso: string | null) => (iso && /T\d{2}:\d{2}/.test(iso) ? iso.slice(11, 16) : null);

/** Nights of a stay (check-in to check-out), or null when the dates are missing. */
export function nightsOf(stay: Pick<Stay, 'check_in' | 'check_out'>): number | null {
  return stay.check_in && stay.check_out ? daysBetween(stay.check_in, stay.check_out) : null;
}

/** Next station: photo with name, round open button, trip day and three info rows (arrival, overnight stay, highlights). */
export function NextStopCard({ stop, previous, leg, stays, bookings, trip }: { stop: TripStop; previous: TripStop | null; leg: Route | undefined; stays: readonly Stay[]; bookings: readonly Booking[]; trip: Trip | undefined }) {
  const { card, hero } = useStopImages(stop);
  const image = card ?? hero;
  const tripDay = trip?.start_date && stop.arrive_at ? daysBetween(trip.start_date, stop.arrive_at) + 1 : null;
  const flight = bookings.find((b) => b.kind === 'flight' && b.stop_id === stop.id);
  const arrivalTitle = previous && leg ? `${placeName(previous)} → ${placeName(stop)}` : (flight?.title ?? stop.title);
  const drive = leg ? driveSummary(leg.distance_km, leg.duration_minutes) : null;
  const arrivalDetail = [stop.arrive_at ? formatDate(stop.arrive_at, { day: 'numeric', month: 'short', year: 'numeric' }) : null, timeOf(flight?.starts_at ?? null), drive].filter(Boolean).join(' · ');
  const highlights = stop.highlights.slice(0, 3);

  return (
    <Card className="flex h-full flex-col gap-4" data-testid="next-stop-card">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="next-stop-title" className="font-display text-xl font-bold md:text-2xl">Unser nächster Stopp</h2>
        {tripDay && <span className="rounded-full bg-gold-100 px-3 py-0.5 text-sm font-bold text-gold-700">Tag {tripDay}</span>}
        {stop.arrive_at && <span className="text-sm text-slate">{formatDate(stop.arrive_at)}</span>}
      </div>
      <div className="grid flex-1 gap-4 sm:grid-cols-2">
        <Link href={`/route/${stop.id}`} aria-label={`Station ${placeName(stop)} öffnen`} className="group relative block min-h-52 overflow-hidden rounded-xl bg-sand" title={image && !image.location_verified ? 'Regionsmotiv: Landschaft der Gegend' : undefined}>
          {image ? <ResponsiveTravelImage image={image} kind="card" sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 100vw" className="transition-transform duration-200 group-hover:scale-[1.03]" /> : <Scene name={sceneForStop(stop)} label={`Illustration zu ${stop.title}`} />}
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-deep/85 via-deep/40 to-transparent p-4 pt-12 text-white">
            <span className={clsx('block font-display font-bold leading-tight', overlayTitle(stop).length > 16 ? 'text-xl' : 'text-2xl')}>{overlayTitle(stop)}</span>
            <span className="text-sm">{stop.country}</span>
          </span>
          <span className="absolute bottom-3 right-3 grid size-10 place-items-center rounded-full bg-white text-deep shadow-card"><ArrowRight size={18} aria-hidden /></span>
        </Link>
        <ul className="space-y-3">
          <InfoRow icon={Plane} label="Anreise"><p className="font-semibold">{arrivalTitle}</p>{arrivalDetail && <p className="text-slate">{arrivalDetail}</p>}</InfoRow>
          <InfoRow icon={BedDouble} label="Übernachtung">
            {stays.length > 0 ? stays.map((s) => (
              <p key={s.id}><span className="font-semibold">{s.name}</span>{nightsOf(s) !== null && <span className="text-slate"> · {nightsOf(s)} {nightsOf(s) === 1 ? 'Nacht' : 'Nächte'}</span>}</p>
            )) : <p className="text-slate">Noch keine Unterkunft erfasst. <Link href="/stays" className="font-semibold text-deep underline">Unterkünfte</Link></p>}
          </InfoRow>
          {highlights.length > 0 && <InfoRow icon={Sparkles} label="Highlights"><p className="font-semibold">{highlights.join(' · ')}</p></InfoRow>}
        </ul>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- route

/** Illustrated route map of the stations in the travel region; photo pins come from the image library. */
export function RoutePreviewCard({ stops, library, currentStopId }: { stops: readonly TripStop[]; library: readonly DestinationImage[]; currentStopId: string | null }) {
  const mapStops: IllustratedStop[] = stops
    .filter((s) => REGION_COUNTRIES.includes(s.country) && s.latitude !== null && s.longitude !== null)
    .map((s) => {
      const image = imagesForStop(s, library);
      const pinImage = image.card ?? image.hero ?? image.gallery[0];
      const path = pinImage ? (pinImage.variants.thumb ?? Object.values(pinImage.variants)[0]) : null;
      return { id: s.id, title: s.title, sequence: s.sequence, latitude: s.latitude as number, longitude: s.longitude as number, imageUrl: path ? imageUrl(path) : null };
    });
  return (
    <Card className="flex h-full flex-col" data-testid="route-preview">
      <CardHeading id="route-preview-title" title="Unsere Route" action={<Link href="/map" className={textLink}>Karte öffnen <ArrowRight size={14} aria-hidden /></Link>} />
      {mapStops.length > 0 ? <IllustratedTripMap stops={mapStops} currentStopId={currentStopId} /> : <p className="text-sm text-slate">Sobald Stationen mit Koordinaten angelegt sind, erscheint hier die Route.</p>}
    </Card>
  );
}

// ---------------------------------------------------------------- impressions

const TAGLINES: Record<string, string> = { etosha: 'Majestätische Begegnungen', sossusvlei: 'Endlose Weite', divundu: 'Natur in ihrer reinsten Form', chobe: 'Magische Sonnenuntergänge', swakopmund: 'Wo die Wüste das Meer trifft', kasane: 'Am Fluss der Elefanten', maun: 'Tor zum Delta', nata: 'Weite Salzpfannen', erongo: 'Granit und Stille', rundu: 'Am Okavango', windhoek: 'Ankommen in Namibia' };
const HIGHLIGHT_ORDER = ['etosha', 'sossusvlei', 'divundu', 'chobe', 'kasane', 'maun', 'swakopmund', 'nata', 'erongo', 'rundu', 'windhoek'];

export interface Impression {
  image: DestinationImage;
  title: string;
  subtitle: string;
  /** The station page of this place when the trip has one, otherwise the plan. */
  href: string;
}

/** One landscape or wildlife photo per place, the route's highlights first; none for places without a suitable library photo. */
export function impressionsFor(library: readonly DestinationImage[], stops: readonly Pick<TripStop, 'id' | 'title'>[] = []): Impression[] {
  const result: Impression[] = [];
  for (const key of HIGHLIGHT_ORDER) {
    const own = library.filter((i) => i.place_key === key && i.role === 'gallery' && !/mineral|crystal|quartz|flower|insect|hotel|building/i.test(i.alt_text));
    const best = own.find((i) => i.location_verified) ?? own[0];
    const stop = stops.find((s) => placeKeyForStop(s.title) === key);
    if (best) result.push({ image: best, title: best.place_label, subtitle: TAGLINES[key] ?? best.country ?? '', href: stop ? `/route/${stop.id}` : '/route' });
    if (result.length === IMPRESSIONS_MAX) break;
  }
  return result;
}

export function ImpressionsCard({ impressions }: { impressions: Impression[] }) {
  if (impressions.length === 0) return null;
  return (
    <Card data-testid="impressions">
      <CardHeading id="impressions-title" title="Reiseimpressionen" action={<Link href="/route" className={textLink}>Alle ansehen <ArrowRight size={14} aria-hidden /></Link>} />
      <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {impressions.map(({ image, title, subtitle, href }) => (
          <li key={image.id}>
            <Link href={href} className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-sand" title={image.location_verified ? undefined : 'Regionsmotiv: Landschaft der Gegend'}>
              <ResponsiveTravelImage image={image} kind="gallery" sizes="(min-width: 1280px) 14vw, 40vw" className="transition-transform duration-200 group-hover:scale-[1.04]" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-deep/90 via-deep/50 to-transparent p-3 pt-10 text-white">
                <span className="block font-display text-lg font-bold leading-tight">{title}</span>
                <span className="text-xs">{subtitle}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- tasks

const TASK_ICONS: { pattern: RegExp; icon: typeof Wallet; label: string }[] = [
  { pattern: /bezahl|zahl|anzahlung|rechnung|überweis|kaution/i, icon: Wallet, label: 'Zahlung' },
  { pattern: /einkauf|selbstversorgung|besorg|kaufen/i, icon: ShoppingBasket, label: 'Einkauf' },
  { pattern: /mietwagen|auto|fahrzeug|abholung|transfer/i, icon: Car, label: 'Mietwagen' },
  { pattern: /beleg|dokument|voucher|bestätigung|unterlagen|pass|visum|versicherung/i, icon: FileText, label: 'Dokument' },
];

/** Category icon of a task, guessed from its title (tasks have no category field). */
export function taskCategory(title: string): { icon: typeof Wallet; label: string } {
  return TASK_ICONS.find((c) => c.pattern.test(title)) ?? { icon: CircleCheck, label: 'Aufgabe' };
}

/** Red dot for overdue or high-priority tasks, orange for those due within a week; none otherwise. */
export function taskUrgency(item: Pick<ActionItem, 'due_at' | 'priority'>, today: string): 'critical' | 'soon' | null {
  const days = item.due_at ? daysBetween(today, item.due_at.slice(0, 10)) : null;
  if (item.priority === 'high' || (days !== null && days < 0)) return 'critical';
  if (days !== null && days <= SOON_TASK_DAYS) return 'soon';
  return null;
}

function TaskRow({ item, members, today, canEdit, onToggle }: { item: ActionItem; members: readonly Member[]; today: string; canEdit: boolean; onToggle: (item: ActionItem) => void }) {
  const category = taskCategory(item.title);
  const urgency = taskUrgency(item, today);
  const owner = members.find((m) => m.id === item.owner_user_id)?.display_name;
  const days = item.due_at ? daysBetween(today, item.due_at.slice(0, 10)) : null;
  // "Nicht zugewiesen" only matters when the task is urgent; otherwise the line shows due date or owner.
  const detail = [item.due_at ? `Fällig ${formatShortDate(item.due_at)}` : null, owner ? `Zuständig: ${owner}` : urgency ? 'Nicht zugewiesen' : null].filter(Boolean).join(' · ') || category.label;
  return (
    <li className="flex min-h-14 items-center gap-3 py-2">
      <input id={`chk-${item.id}`} type="checkbox" checked={item.status === 'done'} disabled={!canEdit} onChange={() => onToggle(item)} className="size-5 shrink-0 accent-[#0F3D4E]" />
      <category.icon size={18} aria-hidden className="shrink-0 text-clay-500" />
      <label htmlFor={`chk-${item.id}`} className="min-w-0 flex-1 text-[15px]">
        <span className="sr-only">{category.label}: </span>
        {item.title}
        <span className="block text-xs text-muted">{detail}{days !== null && days < 0 ? ' (überfällig)' : ''}</span>
      </label>
      {urgency && (
        <>
          <span aria-hidden className={clsx('size-2.5 shrink-0 rounded-full', urgency === 'critical' ? 'bg-clay-500' : 'bg-gold-500')} />
          <span className="sr-only">{urgency === 'critical' ? 'dringend' : 'bald fällig'}</span>
        </>
      )}
    </li>
  );
}

/** Compact task list: the first four open tasks, the rest on request, new tasks behind a plus. Receipts and booking checks as badges. */
export function TasksCard({ items, members, today, role, withoutReceipt, unclearBookings, planFindings, onToggle }: { items: ActionItem[]; members: readonly Member[]; today: string; role: Role; withoutReceipt: number; unclearBookings: number; planFindings: number; onToggle: (item: ActionItem) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const canEdit = isAdult(role);
  const visible = isExpanded ? items : items.slice(0, TASKS_COLLAPSED);
  return (
    <Card data-testid="task-summary">
      <CardHeading
        id="tasks-title"
        title="Offene Aufgaben"
        action={canEdit && (
          <button type="button" aria-expanded={isAdding} aria-label="Aufgabe hinzufügen" onClick={() => setIsAdding((value) => !value)} className="grid size-11 place-items-center rounded-full border border-line text-deep hover:bg-sand-50"><Plus size={18} aria-hidden /></button>
        )}
      />
      <p className="mb-2 text-sm text-slate" data-testid="open-count">{items.length} offen</p>
      <div className="mb-2 flex flex-wrap gap-2 text-xs font-semibold">
        <Link href="/stays" data-testid="booking-check" className="rounded-full bg-ochre-50 px-3 py-1 text-ochre-700">{unclearBookings > 0 ? `${unclearBookings} Buchungen zu prüfen` : 'Buchungen alle geklärt'}</Link>
        {canEdit && planFindings > 0 && <Link href="/route#reise-check" data-testid="plan-findings" className="rounded-full bg-sand px-3 py-1 text-deep">{planFindings} {planFindings === 1 ? 'Hinweis' : 'Hinweise'} im Reise-Check</Link>}
        {canEdit && <Link href="/stays" data-testid="missing-receipts" className="rounded-full bg-clay-50 px-3 py-1 text-clay-700">{withoutReceipt} ohne Beleg</Link>}
      </div>
      <ul aria-label="Offene Aufgaben" className="divide-y divide-line">
        {visible.length === 0 && <li className="py-3 text-sm text-muted">Keine offenen Aufgaben.</li>}
        {visible.map((item) => <TaskRow key={item.id} item={item} members={members} today={today} canEdit={canEdit} onToggle={onToggle} />)}
      </ul>
      {items.length > TASKS_COLLAPSED && (
        <button type="button" aria-expanded={isExpanded} onClick={() => setIsExpanded((value) => !value)} className={clsx(textLink, 'mt-2')}>{isExpanded ? 'Weniger anzeigen' : `Alle ${items.length} anzeigen`}</button>
      )}
      {canEdit && isAdding && <AddActionForm label="Offene Aufgaben" className="mt-3" onAdded={() => setIsAdding(false)} />}
    </Card>
  );
}

// ---------------------------------------------------------------- family and quick actions

export function FamilyCard({ members }: { members: Member[] }) {
  const active = members.filter((m) => m.status === 'active');
  return (
    <Card data-testid="family-card" className="h-full">
      <CardHeading id="family-title" title="Unsere Familie" />
      <ul className="flex flex-wrap gap-x-3 gap-y-4" aria-label="Familienmitglieder">
        {active.map((m) => (
          <li key={m.id} className="flex w-[5.5rem] flex-col items-center gap-1 text-center">
            <MemberAvatar member={m} size={52} />
            <span className="w-full truncate text-xs font-semibold" title={m.display_name}>{m.display_name.replace('Demo-', '')}</span>
            <span className="text-xs leading-tight text-muted">{roleLabel[m.role]}</span>
          </li>
        ))}
        <li className="flex w-[5.5rem] flex-col items-center gap-1 text-center">
          <Link href="/family" aria-label="Familienmitglied einladen" className="grid size-[52px] place-items-center rounded-full border border-dashed border-muted text-deep hover:bg-sand-50"><Plus size={20} aria-hidden /></Link>
          <span className="text-xs font-semibold">Einladen</span>
        </li>
      </ul>
    </Card>
  );
}

export interface QuickCounts {
  stays: number;
  bookings: number;
  journal: number;
  sightings: number;
  documents: number;
}

interface Tile {
  href: string;
  label: string;
  detail: string;
  icon: typeof Plane;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Six frequent destinations with a counter line from the data; finance and documents are replaced for members and children. */
export function quickTiles(counts: QuickCounts, role: Role): Tile[] {
  const adult = isAdult(role);
  return [
    { href: '/stays', label: 'Unterkünfte', detail: plural(counts.stays, 'Unterkunft', 'Unterkünfte'), icon: BedDouble },
    { href: '/bookings', label: 'Buchungen', detail: plural(counts.bookings, 'Buchung', 'Buchungen'), icon: Plane },
    { href: '/journal', label: 'Tagebuch', detail: plural(counts.journal, 'Eintrag', 'Einträge'), icon: BookOpenText },
    { href: '/sightings', label: 'Safari-Tracker', detail: plural(counts.sightings, 'Sichtung', 'Sichtungen'), icon: PawPrint },
    adult ? { href: '/expenses', label: 'Ausgaben', detail: 'Budget im Blick', icon: Wallet } : { href: '/gallery', label: 'Galerie', detail: 'Fotos und Videos', icon: ImageIcon },
    adult ? { href: '/safety', label: 'Dokumente', detail: plural(counts.documents, 'Datei', 'Dateien'), icon: FileText } : { href: '/safety', label: 'Sicherheit', detail: 'Notfallkontakte', icon: ShieldCheck },
  ];
}

export function QuickActions({ tiles }: { tiles: Tile[] }) {
  return (
    <Card className="h-full">
      <CardHeading id="quick-title" title="Schnellzugriff" />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => (
          <li key={tile.href + tile.label}>
            <Link href={tile.href} className="flex h-full min-h-24 flex-col items-start gap-1 rounded-xl border border-line bg-white p-3 transition-colors hover:bg-sand-50">
              <tile.icon size={22} aria-hidden className="text-clay-500" />
              <strong className="text-sm">{tile.label}</strong>
              <span className="text-xs text-muted">{tile.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
