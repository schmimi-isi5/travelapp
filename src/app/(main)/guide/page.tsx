'use client';

import { Send, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Card, Chip, Input, Notice, PageHeader, Select, Toolbar } from '@/components/ui';
import { TipCard } from '@/features/ai/tip-card';
import { fetchProviderStatus, getAiConsent, requestAi, type AiOutcome } from '@/lib/ai/client';
import type { ProviderStatus } from '@/lib/ai/types';
import { useTable, useTips } from '@/lib/db/hooks';
import { formatDateTime } from '@/lib/formatting';

const PROMPTS = ['Wie beobachten wir Tiere am Wasserloch?', 'Was gilt beim Grenzübertritt?', 'Tipps zum Fahren auf Schotterpisten', 'Gesundheit und Versicherung'];

export default function GuidePage() {
  const { online } = useApp();
  const tips = useTips().rows;
  const stops = useTable('trip_stops').rows;
  const [stopFilter, setStopFilter] = useState('all');
  const [question, setQuestion] = useState('');
  const [outcome, setOutcome] = useState<AiOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    setConsent(getAiConsent());
    void fetchProviderStatus().then(setStatus);
  }, [online]);

  async function ask(text: string) {
    if (!text.trim()) return;
    setBusy(true);
    setOutcome(await requestAi({ task: 'answer_question', input: { question: text } }, tips));
    setBusy(false);
  }

  const shown = tips.filter((t) => (stopFilter === 'all' ? true : stopFilter === 'general' ? t.stop_id === null : t.stop_id === stopFilter));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="KI-Guide" subtitle="Kuratierte Tipps mit Herkunft und Aktualitätsstatus. Funktioniert offline; KI nur mit deiner Freigabe." />
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Sparkles size={18} aria-hidden className="text-deep" />
          <h2 className="font-bold">Frag den Guide</h2>
          <Badge tone={status?.state === 'ready' && consent && online ? 'ai' : 'neutral'} data-testid="ai-mode">
            {status?.state === 'ready' && consent && online ? `KI aktiv (${status.provider})` : 'Lokale Hinweise (keine KI)'}
          </Badge>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void ask(question); }} className="flex gap-2" aria-label="Frage stellen">
          <Input aria-label="Deine Frage" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="z. B. Wasserloch Tierbeobachtung" />
          <Button type="submit" disabled={busy}><Send size={16} aria-hidden /> Fragen</Button>
        </form>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Beispielfragen">
          {PROMPTS.map((p) => <li key={p}><Chip onClick={() => { setQuestion(p); void ask(p); }}>{p}</Chip></li>)}
        </ul>
        {outcome && (
          <div className="mt-4 rounded-md bg-sand-50 p-4" data-testid="ai-answer" aria-live="polite">
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge tone={outcome.result.origin === 'ai_generated' ? 'ai' : 'neutral'}>{outcome.result.origin === 'ai_generated' ? `KI-Entwurf · ${outcome.result.provider}` : 'Regelbasiert · keine KI'}</Badge>
              <Badge tone="warn">Stand {formatDateTime(outcome.result.generated_at)}</Badge>
            </div>
            <p className="whitespace-pre-line">{outcome.result.text}</p>
            <p className="mt-2 text-sm text-muted">{outcome.result.availability_note}</p>
            {outcome.fallbackReason && <p className="mt-1 text-sm text-muted">Hinweis: {outcome.fallbackReason}</p>}
            {outcome.result.sources.map((s) => s.url && <a key={s.url} href={s.url} target="_blank" rel="noreferrer noopener" className="mt-1 block text-sm font-semibold text-deep underline">Quelle: {s.title}</a>)}
          </div>
        )}
      </Card>
      <Notice tone="warn" title="Keine Live-Daten">Öffnungszeiten, Grenzregeln, Wetter und Gesundheitshinweise sind nicht live und nicht verbindlich. Offizielle Stellen vor Ort prüfen.</Notice>
      <div>
        <Toolbar>
          <Select aria-label="Hinweise nach Station" value={stopFilter} onChange={(e) => setStopFilter(e.target.value)} className="w-auto min-w-48">
            <option value="all">Alle Hinweise</option>
            <option value="general">Allgemein</option>
            {[...stops].sort((a, b) => a.sequence - b.sequence).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </Select>
        </Toolbar>
        <div className="grid gap-3 md:grid-cols-2">{shown.map((t) => <TipCard key={t.id} tip={t} stopTitle={stops.find((s) => s.id === t.stop_id)?.title} />)}</div>
      </div>
    </div>
  );
}
