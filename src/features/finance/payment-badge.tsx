import { Badge } from '@/components/ui';
import type { PaymentState } from '@/lib/domain/money';

const LABELS: Record<PaymentState, { text: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' | 'info' }> = {
  paid: { text: 'bezahlt', tone: 'ok' },
  partial: { text: 'teilbezahlt', tone: 'warn' },
  open: { text: 'offen', tone: 'danger' },
  unknown: { text: 'unbekannt', tone: 'neutral' },
  overpaid: { text: 'überzahlt', tone: 'info' },
};

export function PaymentStatusBadge({ state }: { state: PaymentState }) {
  const label = LABELS[state];
  return (
    <Badge tone={label.tone} data-testid="payment-status">
      {label.text}
    </Badge>
  );
}
