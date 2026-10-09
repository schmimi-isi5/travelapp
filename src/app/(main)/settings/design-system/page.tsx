'use client';

import { PawPrint } from 'lucide-react';
import { Scene } from '@/components/scene';
import { Accordion, Badge, Button, Card, EmptyState, Notice, PageHeader, ProgressBar, Skeleton } from '@/components/ui';
import { PaymentStatusBadge } from '@/features/finance/payment-badge';

const COLORS = [
  ['Deep Teal', '#0F3D4E'], ['Safari Gold', '#D4A373'], ['Sand', '#F5E6D3'], ['Sunset Clay', '#C65A3A'], ['Olive', '#5B6B3A'], ['Slate', '#334155'], ['Erfolg', '#15803D'], ['Warnung', '#B45309'], ['Fehler', '#B91C1C'], ['Info', '#1D4ED8'],
] as const;

export default function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader title="Design-System" subtitle="Safari Travel Premium: Tokens und Komponenten (Inter als UI-Schrift, 16 px Radien, WCAG-AA-Kontraste)." />
      <section aria-labelledby="c"><h2 id="c" className="mb-3 text-lg font-bold">Farben</h2><ul className="grid grid-cols-2 gap-3 md:grid-cols-5">{COLORS.map(([n, v]) => <li key={n} className="overflow-hidden rounded-lg border border-line bg-white"><div className="h-14" style={{ background: v }} /><p className="p-2 text-sm font-semibold">{n}<br /><code className="font-normal text-muted">{v}</code></p></li>)}</ul></section>
      <section aria-labelledby="b"><h2 id="b" className="mb-3 text-lg font-bold">Buttons &amp; Badges</h2><div className="flex flex-wrap gap-3"><Button>Primär</Button><Button variant="sunset">Sunset</Button><Button variant="secondary">Sekundär</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Gefahr</Button><Button disabled>Deaktiviert</Button></div><div className="mt-3 flex flex-wrap gap-2"><PaymentStatusBadge state="paid" /><PaymentStatusBadge state="partial" /><PaymentStatusBadge state="open" /><PaymentStatusBadge state="unknown" /><Badge tone="demo">Demo</Badge><Badge tone="ai">KI-Entwurf</Badge></div></section>
      <section aria-labelledby="i"><h2 id="i" className="mb-3 text-lg font-bold">Illustrationen</h2><div className="grid gap-3 sm:grid-cols-3">{(['dunes', 'waterhole', 'coast'] as const).map((s) => <div key={s} className="h-36 overflow-hidden rounded-lg"><Scene name={s} label={`Illustration ${s}`} /></div>)}</div></section>
      <section aria-labelledby="f"><h2 id="f" className="mb-3 text-lg font-bold">Feedback &amp; Zustände</h2><div className="space-y-3"><Notice tone="info">Information</Notice><Notice tone="warn">Warnung</Notice><Notice tone="danger">Fehler</Notice><ProgressBar value={60} label="Beispiel" /><Skeleton className="h-10 w-full" /><EmptyState icon={<PawPrint />} title="Leerer Zustand" text="Genauso sorgfältig gestaltet wie gefüllte Ansichten." /><Accordion title="Akkordeon"><p>Inhalt</p></Accordion><Card>Karte mit weichem Schatten</Card></div></section>
    </div>
  );
}
