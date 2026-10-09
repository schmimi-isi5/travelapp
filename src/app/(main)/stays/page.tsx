'use client';

import { BedDouble, Plus } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Button, Chip, Dialog, EmptyState, Notice, PageHeader, Toolbar } from '@/components/ui';
import { AccommodationCard, clarificationReasons } from '@/features/stays/accommodation-card';
import { StayForm } from '@/features/stays/stay-form';
import { useTable } from '@/lib/db/hooks';
import { computeStayFinancials } from '@/lib/domain/money';
import { isAdult } from '@/lib/domain/policy';

type Filter = 'all' | 'open' | 'partial' | 'paid' | 'clarify';
const FILTERS: [Filter, string][] = [['all', 'Alle'], ['open', 'Offen'], ['partial', 'Teilbezahlt'], ['paid', 'Bezahlt'], ['clarify', 'Klärbedarf']];

export default function StaysPage() {
  const { role } = useApp();
  const adult = isAdult(role);
  const stays = useTable('stays').rows;
  const stops = useTable('trip_stops').rows;
  const payments = useTable('payments').rows;
  const documents = useTable('documents').rows;
  const items = useTable('action_items').rows;
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);

  const enriched = [...stays]
    .sort((a, b) => (a.check_in ?? '9999').localeCompare(b.check_in ?? '9999'))
    .map((stay) => {
      const p = payments.filter((x) => x.stay_id === stay.id);
      const d = documents.filter((x) => x.stay_id === stay.id);
      return { stay, payments: p, docs: d, state: computeStayFinancials(stay, p).state, clarify: clarificationReasons(stay, p, d).length > 0 };
    });
  const matches = (e: (typeof enriched)[number], f: Filter) =>
    f === 'all' ? true : f === 'clarify' ? e.clarify : f === 'open' ? e.state === 'open' : f === 'partial' ? e.state === 'partial' : e.state === 'paid' || e.state === 'overpaid';
  const visible = enriched.filter((e) => matches(e, filter));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Unterkünfte"
        subtitle="Buchungsstatus, Preise, Belege und Zahlungen je Unterkunft. Unbekanntes bleibt sichtbar „unbekannt“."
        actions={
          adult && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={18} aria-hidden /> Unterkunft anlegen
            </Button>
          )
        }
      />
      {!adult && (
        <div className="mb-4">
          <Notice tone="info">Preise, Zahlungen und Belege sind in dieser Rolle ausgeblendet.</Notice>
        </div>
      )}
      {adult && (
        <Toolbar>
          {FILTERS.map(([key, label]) => (
            <Chip key={key} active={filter === key} onClick={() => setFilter(key)} count={enriched.filter((e) => matches(e, key)).length}>
              {label}
            </Chip>
          ))}
        </Toolbar>
      )}
      {visible.length === 0 ? (
        <EmptyState
          icon={<BedDouble />}
          title={stays.length === 0 ? 'Noch keine Unterkünfte' : 'Keine Treffer'}
          text={stays.length === 0 ? 'Lege die erste Unterkunft an, um Preise, Belege und Zahlungen zu verfolgen.' : 'Für diesen Filter gibt es aktuell keine Unterkunft.'}
          action={adult && stays.length === 0 ? <Button onClick={() => setAdding(true)}>Unterkunft anlegen</Button> : undefined}
        />
      ) : (
        <div className="space-y-4">
          {visible.map((e) => (
            <AccommodationCard key={e.stay.id} stay={e.stay} stop={stops.find((s) => s.id === e.stay.stop_id)} stops={stops} payments={e.payments} documents={e.docs} items={items.filter((i) => i.stay_id === e.stay.id)} />
          ))}
        </div>
      )}
      <Dialog open={adding} onClose={() => setAdding(false)} title="Unterkunft anlegen">
        <StayForm stops={stops} onDone={() => setAdding(false)} />
      </Dialog>
    </div>
  );
}
