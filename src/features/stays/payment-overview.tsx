import { Badge, Card } from '@/components/ui';
import { formatMinor } from '@/lib/domain/money';
import type { PaymentOverview as Overview } from '@/lib/domain/payment-overview';
import { formatDate } from '@/lib/formatting';

/** Two lists above the stays: what is still to pay, and what first needs clarifying. Adults only, decided by the caller. */
export function PaymentOverview({ overview }: { overview: Overview }) {
  const { open, openTotals, toClarify } = overview;
  return (
    <section aria-label="Zahlungsübersicht" className="mb-6 grid gap-4 lg:grid-cols-2" data-testid="payment-overview">
      <Card>
        <h2 className="text-lg font-bold">Noch zu zahlen</h2>
        <p className="mb-2 text-sm text-slate" data-testid="open-payments-total">
          {open.length === 0 ? 'Nichts offen, soweit die Preise bestätigt sind.' : `${open.length} ${open.length === 1 ? 'Unterkunft' : 'Unterkünfte'} · ${openTotals.map((t) => formatMinor(t.totalMinor, t.currency)).join(' + ')}`}
        </p>
        <ul className="divide-y divide-line">
          {open.map((o) => (
            <li key={o.stayId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm" data-testid="open-payment">
              <a href={`#stay-${o.stayId}`} className="min-w-0 flex-1 font-semibold text-deep underline">{o.name}</a>
              <span className="text-muted">{o.dueAt ? `fällig ${formatDate(o.dueAt)}` : 'Fälligkeit unbekannt'}</span>
              {o.isOverdue && <Badge tone="danger">überfällig</Badge>}
              {o.isPartial && <Badge tone="warn">teilbezahlt</Badge>}
              <span className="tabular font-semibold">{formatMinor(o.remainingMinor, o.currency)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Nur Unterkünfte mit bestätigtem Preis. Rest = Preis minus verifizierte Zahlungen in gleicher Währung.</p>
      </Card>
      <Card>
        <h2 className="text-lg font-bold">Zu klären</h2>
        <p className="mb-2 text-sm text-slate" data-testid="clarify-payments-count">
          {toClarify.length === 0 ? 'Alles geklärt.' : `${toClarify.length} ${toClarify.length === 1 ? 'Unterkunft' : 'Unterkünfte'} mit offenen Fragen`}
        </p>
        <ul className="divide-y divide-line">
          {toClarify.map((c) => (
            <li key={c.stayId} className="py-2 text-sm" data-testid="clarify-payment">
              <a href={`#stay-${c.stayId}`} className="font-semibold text-deep underline">{c.name}</a>
              <span className="block text-muted">{c.reasons.join(' · ')}</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
