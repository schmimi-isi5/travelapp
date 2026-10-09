'use client';

import { CloudSun, Database, FileWarning, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/components/app-provider';
import { MORE_NAV, PRIMARY_NAV, visibleFor } from '@/components/nav-items';
import { Scene, sceneNameFromPath } from '@/components/scene';
import { Badge, Card } from '@/components/ui';
import { ActionChecklist } from '@/features/common/action-checklist';
import { sceneForStop } from '@/features/trip/stop-card';
import { useTable } from '@/lib/db/hooks';
import { isAdult } from '@/lib/domain/policy';
import { buildDayBriefing } from '@/lib/domain/trip-day';
import { formatDate } from '@/lib/formatting';

export default function DashboardPage() {
  const { today, role, online, pendingCount, hasDemoDateOverride } = useApp();
  const stops = useTable('trip_stops').rows;
  const items = useTable('action_items').rows;
  const media = useTable('media_assets').rows;
  const stays = useTable('stays').rows;
  const bookings = useTable('bookings').rows;
  const documents = useTable('documents').rows;
  const trips = useTable('trips').rows;
  const trip = trips[0];

  const briefing = buildDayBriefing(stops, items, today);
  const featured = briefing.featuredStop;
  const latestMedia = [...media].sort((a, b) => (b.captured_at ?? '').localeCompare(a.captured_at ?? '')).slice(0, 4);
  const adult = isAdult(role);

  const unclearBookings = bookings.filter((b) => b.booking_status === 'unknown').length + stays.filter((s) => s.booking_status === 'unknown').length;
  const docsFor = new Set(documents.flatMap((d) => [d.stay_id, d.booking_id].filter(Boolean)));
  const withoutReceipt = [...stays.filter((s) => s.booking_status !== 'cancelled').map((s) => s.id), ...bookings.filter((b) => b.booking_status !== 'cancelled').map((b) => b.id)].filter((id) => !docsFor.has(id)).length;

  const allRows = [...stops, ...stays, ...bookings, ...items, ...media];
  const demoCount = allRows.filter((r) => r.source_type === 'demo').length;
  const heading =
    briefing.phase === 'before'
      ? `Abreise in ${briefing.daysUntilStart} ${briefing.daysUntilStart === 1 ? 'Tag' : 'Tagen'}`
      : briefing.phase === 'during'
        ? briefing.currentStop?.title ?? 'Unterwegs'
        : briefing.phase === 'after'
          ? 'Reise abgeschlossen'
          : 'Reisetermine fehlen';

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section aria-labelledby="hero-title" className="relative overflow-hidden rounded-xl bg-deep text-white shadow-card">
        <div className="absolute inset-0 opacity-90">{featured ? <Scene name={sceneForStop(featured)} label="" className="" /> : <Scene name="savanna" label="" />}</div>
        <div className="absolute inset-0 bg-gradient-to-t from-deep via-deep/70 to-deep/10" aria-hidden />
        <div className="relative flex min-h-[340px] flex-col justify-end gap-3 p-6 md:min-h-[400px] md:p-10">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Dein nächster Reisetag</span>
          <h1 id="hero-title" className="max-w-2xl !text-white text-3xl font-extrabold md:text-5xl">
            {heading}
          </h1>
          {featured && (
            <p className="max-w-xl text-white/90" data-testid="featured-stop">
              {briefing.phase === 'during' ? 'Heute: ' : 'Nächste Station: '}
              <strong>{featured.title}</strong> ({featured.country}) · {formatDate(featured.arrive_at)}
              {featured.is_demo && ' · Beispieldaten'}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-3">
            <Link href={featured ? `/route/${featured.id}` : '/route'} className="inline-flex min-h-11 items-center rounded-full bg-gold px-6 font-bold text-deep hover:bg-sand">
              Tagesbriefing öffnen
            </Link>
            <Link href="/route" className="inline-flex min-h-11 items-center rounded-full border border-white/60 px-6 font-semibold hover:bg-white/10">
              Route ansehen
            </Link>
          </div>
          {hasDemoDateOverride && <Badge tone="demo" className="w-fit">Demo-Datum: {formatDate(today)}</Badge>}
        </div>
      </section>

      <section aria-label="Eckdaten" className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-bold uppercase text-muted">Abreise laut Planung</p>
          <p className="mt-1 text-xl font-extrabold text-deep">{formatDate(trip?.start_date)}</p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase text-muted">Reiseziele</p>
          <p className="mt-1 text-xl font-extrabold text-deep">{trip?.countries.join(' & ') || 'unbekannt'}</p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase text-muted">Buchungsstatus</p>
          <p className="mt-1 text-xl font-extrabold text-deep" data-testid="booking-check">{unclearBookings > 0 ? `${unclearBookings} zu prüfen` : 'alle geklärt'}</p>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-1 text-lg font-bold">Offene Aufgaben</h2>
          <p className="mb-3 text-sm text-slate" data-testid="open-count">{briefing.openItems.length} offen</p>
          <ActionChecklist items={briefing.openItems.slice(0, 6)} label="Offene Aufgaben" />
        </Card>
        <div className="space-y-6">
          {adult && (
            <Card>
              <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><FileWarning size={18} aria-hidden /> Fehlende Belege</h2>
              <p className="text-slate" data-testid="missing-receipts">
                {withoutReceipt} Unterkünfte/Buchungen ohne hinterlegten Beleg.
              </p>
              <Link href="/stays" className="mt-2 inline-block font-semibold text-deep underline">Unterkünfte prüfen</Link>
            </Card>
          )}
          <Card>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><CloudSun size={18} aria-hidden /> Wetter</h2>
            <p className="text-slate">Nicht verfügbar: kein Wetterdienst verbunden.</p>
          </Card>
          <Card>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><WifiOff size={18} aria-hidden /> Offline-Status</h2>
            <p className="text-slate">{online ? 'Online' : 'Offline'} · {pendingCount} Änderung{pendingCount === 1 ? '' : 'en'} in der Warteschlange</p>
          </Card>
          <Card>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><Database size={18} aria-hidden /> Datenherkunft</h2>
            <p className="text-slate">{demoCount} von {allRows.length} Datensätzen sind Demo-Daten. Reale Daten nur über bewussten Import.</p>
          </Card>
        </div>
      </div>

      <section aria-labelledby="media-title">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="media-title" className="text-xl font-bold">Letzte Erinnerungen</h2>
          <Link href="/gallery" className="font-semibold text-deep underline">Galerie</Link>
        </div>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {latestMedia.map((m) => {
            const scene = sceneNameFromPath(m.storage_path);
            return (
              <li key={m.id} className="aspect-[4/3] overflow-hidden rounded-lg border border-line">
                {scene ? <Scene name={scene} label={m.caption || 'Illustration'} /> : <div className="grid h-full place-items-center bg-sand text-sm">{m.kind}</div>}
              </li>
            );
          })}
          {latestMedia.length === 0 && <li className="col-span-full text-slate">Noch keine Medien.</li>}
        </ul>
      </section>

      <section aria-labelledby="tiles-title">
        <h2 id="tiles-title" className="mb-3 text-xl font-bold">Unser Reisebegleiter</h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {[...visibleFor(PRIMARY_NAV, role).slice(1), ...visibleFor(MORE_NAV, role)].map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="flex h-full min-h-28 flex-col gap-2 rounded-lg border border-line bg-white p-4 shadow-card transition-shadow hover:shadow-lg">
                <span className="grid size-10 place-items-center rounded-full bg-sand text-deep"><item.icon size={20} aria-hidden /></span>
                <strong>{item.label}</strong>
                <span className="text-sm text-slate">{item.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
