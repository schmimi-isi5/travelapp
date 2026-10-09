import type { TravelTip } from '../domain/schemas';
import type { AiRequest, AiResult } from './types';

const STOPWORDS = new Set(['aktuelle', 'aktuell', 'aktuellen', 'vor', 'ort', 'pruefen', 'der', 'die', 'das', 'und', 'oder', 'ein', 'eine', 'ist', 'wie', 'was', 'wo', 'wir', 'ihr', 'mit', 'für', 'auf', 'in', 'im', 'zu', 'den', 'dem', 'es', 'sind', 'kann', 'man']);

const STEM_LENGTH = 6;

/** Lowercased word stems (umlauts folded, first 6 letters) so "Wasserloch" matches "Wasserlöchern". */
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .map((t) => t.slice(0, STEM_LENGTH));
}

const BASE = { provider: 'Lokale Regeln', origin: 'local_rule_based' as const, sources: [] };

/** Extractive summary: first sentence of each entry. Labeled as rule-based, never as AI output. */
export function summarizeLocally(entries: { title: string; body: string }[], now = new Date()): AiResult {
  const lines = entries
    .filter((e) => e.body.trim() || e.title.trim())
    .map((e) => {
      const first = e.body.trim().split(/(?<=[.!?])\s+/)[0] ?? '';
      return `• ${e.title}${first ? `: ${first}` : ''}`;
    });
  return {
    ...BASE,
    text: lines.length ? lines.join('\n') : 'Keine Einträge zum Zusammenfassen.',
    generated_at: now.toISOString(),
    availability_note: 'Regelbasierter Auszug (jeweils erster Satz), keine KI.',
  };
}

/** Keyword match over curated tips already stored on the device; no live data, no invented facts. */
export function answerFromTips(question: string, tips: readonly TravelTip[], now = new Date()): AiResult {
  const wanted = new Set(tokens(question));
  const scored = tips
    .map((tip) => ({ tip, score: tokens(`${tip.title} ${tip.body} ${tip.category}`).filter((t) => wanted.has(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const text = scored.length
    ? scored.map(({ tip }) => `**${tip.title}**: ${tip.body}`).join('\n\n')
    : 'Dazu liegt kein kuratierter Hinweis auf diesem Gerät vor. Aktuelle Informationen (Öffnungszeiten, Grenzen, Wetter) bitte bei offiziellen Stellen prüfen.';
  return {
    ...BASE,
    text,
    generated_at: now.toISOString(),
    availability_note: 'Kuratierte Hinweise von diesem Gerät, offline verfügbar, ohne Live-Daten.',
    sources: scored.flatMap(({ tip }) => (tip.source_reference?.startsWith('http') ? [{ title: tip.title, url: tip.source_reference }] : [])),
  };
}

export function draftDayTextLocally(stopTitle: string, facts: readonly string[], now = new Date()): AiResult {
  const body = facts.length ? facts.map((f) => `• ${f}`).join('\n') : '• Noch keine Notizen für diesen Tag.';
  return {
    ...BASE,
    text: `Tagesentwurf für ${stopTitle}:\n${body}\n\nBitte um eigene Eindrücke ergänzen.`,
    generated_at: now.toISOString(),
    availability_note: 'Vorlage aus vorhandenen Notizen, keine KI.',
  };
}

export function runLocal(request: AiRequest, tips: readonly TravelTip[] = []): AiResult {
  switch (request.task) {
    case 'summarize_journal':
      return summarizeLocally(request.input.entries ?? []);
    case 'answer_question':
      return answerFromTips(request.input.question ?? '', tips);
    case 'draft_day_text':
      return draftDayTextLocally(request.input.stopTitle ?? 'diesen Tag', request.input.facts ?? []);
  }
}
