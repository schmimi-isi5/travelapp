import { AlertTriangle, ExternalLink, Info } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { SourceType, TravelTip } from '@/lib/domain/schemas';
import { formatDate } from '@/lib/formatting';

const SOURCE_LABEL: Record<SourceType, string> = {
  imported_document: 'Aus Dokument importiert',
  user_verified: 'Von uns geprüft',
  user_entered: 'Selbst eingetragen',
  editorial: 'Redaktionell kuratiert',
  ai_generated: 'KI-generiert',
  demo: 'Demo-Beispiel',
};

export function SourceBadge({ source }: { source: SourceType }) {
  return <Badge tone={source === 'ai_generated' ? 'ai' : source === 'demo' ? 'demo' : source === 'user_verified' ? 'ok' : 'neutral'}>{SOURCE_LABEL[source]}</Badge>;
}

export function TipCard({ tip, stopTitle }: { tip: TravelTip; stopTitle?: string }) {
  const Icon = tip.warning_level === 'info' ? Info : AlertTriangle;
  return (
    <article className="rounded-lg border border-line bg-white p-4 shadow-card" data-testid="tip-card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Icon size={16} aria-hidden className={tip.warning_level === 'warning' ? 'text-danger' : tip.warning_level === 'caution' ? 'text-warn' : 'text-info'} />
        <SourceBadge source={tip.source_type} />
        <Badge tone={tip.verified_at ? 'ok' : 'warn'}>{tip.verified_at ? `Geprüft ${formatDate(tip.verified_at)}` : 'Aktualität nicht geprüft'}</Badge>
        <Badge>Offline verfügbar</Badge>
      </div>
      <h3 className="font-bold">{tip.title}</h3>
      {stopTitle && <p className="text-xs text-muted">{stopTitle}</p>}
      <p className="mt-1 text-[15px] text-slate">{tip.body}</p>
      {tip.source_reference?.startsWith('http') && (
        <a href={tip.source_reference} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-deep underline">
          Quelle öffnen <ExternalLink size={14} aria-hidden />
        </a>
      )}
    </article>
  );
}
